import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type bankType from '@/data/bank.json';
import type moduleType from '@/data/modules.json';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  cloudEnabled,
  postgresConnection,
  sourceBucket,
  supabaseAdmin,
} from './cloud';
type Snapshot = {
  bank: typeof bankType;
  modules: typeof moduleType;
  crops: Record<string, { page: number; url: string }[]>;
  assets: Map<string, { path: string; mime: string }>;
  images: Map<string, Promise<string>>;
};
const currentBank = new AsyncLocalStorage<Snapshot>();
let cloudSnapshot: { at: number; value: Promise<Snapshot> } | undefined;
const cache = new Map<string, { stamp: string; value: unknown }>();
function read<T>(name: string): T {
  const file = resolve(process.cwd(), 'data', name);
  const stat = statSync(file);
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  const found = cache.get(file);
  if (found?.stamp === stamp) return found.value as T;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  cache.set(file, { stamp, value });
  return value;
}
export const getBank = () =>
  currentBank.getStore()?.bank || localOnly<typeof bankType>('bank.json');
export const getModules = () =>
  currentBank.getStore()?.modules ||
  localOnly<typeof moduleType>('modules.json');
export const getReferenceCrops = () =>
  currentBank.getStore()?.crops ||
  localOnly<Record<string, { page: number; url: string }[]>>(
    'reference-crops.json',
  );
function localOnly<T>(name: string): T {
  if (cloudEnabled())
    throw new Error('The cloud source bank must be loaded before retrieval.');
  return read<T>(name);
}
export const assetUrl = (name: string) =>
  '/api/source-assets?name=' + encodeURIComponent(name);
export async function loadCloudBank(): Promise<Snapshot> {
  const sql = postgresConnection();
  const [modules, topics, questions, assets] = await Promise.all([
    sql`SELECT data FROM studio.modules ORDER BY id`,
    sql`SELECT data FROM studio.topics ORDER BY id`,
    sql`SELECT id,data,crops FROM studio.source_questions ORDER BY id`,
    sql`SELECT name,path,mime FROM studio.source_assets`,
  ]);
  if (!modules.length || !questions.length)
    throw new Error('The Supabase source bank is empty. Run pnpm cloud seed.');
  const paths = new Map(
    assets.map((a) => [
      a.name,
      { path: a.path as string, mime: a.mime as string },
    ]),
  );
  return {
    bank: {
      topics: topics.map((t) => t.data),
      questions: questions.map((q) => q.data),
      images: Object.fromEntries(
        assets
          .filter((a) => a.name.startsWith('diagram/'))
          .map((a) => [a.name.slice(8), assetUrl(a.name)]),
      ),
    } as typeof bankType,
    modules: modules.map((m) => m.data),
    crops: Object.fromEntries(questions.map((q) => [q.id, q.crops])),
    assets: paths,
    images: new Map(),
  };
}
export async function withBank<T>(run: () => T | Promise<T>): Promise<T> {
  if (!cloudEnabled() || currentBank.getStore()) return run();
  if (!cloudSnapshot || Date.now() - cloudSnapshot.at > 15000)
    cloudSnapshot = { at: Date.now(), value: loadCloudBank() };
  let snapshot: Snapshot;
  try {
    snapshot = await cloudSnapshot.value;
  } catch (e) {
    cloudSnapshot = undefined;
    throw e;
  }
  return currentBank.run(snapshot, run);
}
export function invalidateCloudBank() {
  cloudSnapshot = undefined;
}
export async function referenceImage(
  name: string,
  url: string,
): Promise<string> {
  if (!cloudEnabled()) return url;
  const snapshot = currentBank.getStore();
  const asset = snapshot?.assets.get('diagram/' + name);
  if (!snapshot || !asset)
    throw new Error(
      'A reference diagram is missing from cloud storage. Re-import its source.',
    );
  let promise = snapshot.images.get(name);
  if (!promise) {
    promise = (async () => {
      const { data, error } = await supabaseAdmin()
        .storage.from(sourceBucket)
        .download(asset.path);
      if (error || !data)
        throw new Error('Could not load a source diagram. Retry the request.');
      return (
        `data:${asset.mime};base64,` +
        Buffer.from(await data.arrayBuffer()).toString('base64')
      );
    })();
    snapshot.images.set(name, promise);
  }
  return promise;
}
