import { createHash } from 'node:crypto';
import { postgresConnection, sourceBucket, supabaseAdmin } from './cloud';
import { HttpError } from './security';

export async function putAsset(name: string, bytes: Uint8Array, mime: string) {
  const sql = postgresConnection();
  const hash = createHash('sha256').update(bytes).digest('hex');
  const path =
    'assets/' +
    hash +
    '.' +
    (mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'bin');
  const { error } = await supabaseAdmin()
    .storage.from(sourceBucket)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (
    error &&
    !['409', 'Duplicate'].includes(String(error.statusCode)) &&
    !/already exists/i.test(error.message)
  )
    throw new Error('Could not upload source asset: ' + name);
  await sql`INSERT INTO studio.source_assets(name,path,mime) VALUES(${name},${path},${mime}) ON CONFLICT(name) DO NOTHING`;
  return path;
}
export async function signedAsset(name: string) {
  const [asset] =
    await postgresConnection()`SELECT path FROM studio.source_assets WHERE name=${name}`;
  if (!asset) throw new HttpError(404, 'Source image not found.');
  return signedFile(asset.path);
}
export async function signedFile(path: string) {
  const { data, error } = await supabaseAdmin()
    .storage.from(sourceBucket)
    .createSignedUrl(path, 300);
  if (error || !data)
    throw new HttpError(503, 'Could not open this source file. Retry shortly.');
  return data.signedUrl;
}
