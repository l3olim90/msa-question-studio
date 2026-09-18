import { randomUUID } from 'node:crypto';
import { cloudEnabled, postgresConnection } from './cloud';
import { generationSlot, HttpError } from './security';
export async function acquireGenerationSlot(): Promise<() => Promise<void>> {
  if (!cloudEnabled()) {
    const release = generationSlot();
    return async () => release();
  }
  const sql = postgresConnection(),
    id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73511204)`;
    await tx`DELETE FROM studio.generation_slots WHERE expires_at<now() AND started_at<now()-interval '1 minute'`;
    const [counts] =
      await tx`SELECT count(*) FILTER(WHERE expires_at>now())::int AS active,count(*) FILTER(WHERE started_at>now()-interval '1 minute')::int AS starts FROM studio.generation_slots`;
    if (counts.active >= 2 || counts.starts >= 6)
      throw new HttpError(
        429,
        'Generation capacity reached. Wait before trying again.',
      );
    await tx`INSERT INTO studio.generation_slots(id,expires_at) VALUES(${id},now()+interval '6 minutes')`;
  });
  return async () => {
    await sql`UPDATE studio.generation_slots SET expires_at=now() WHERE id=${id}`;
  };
}
