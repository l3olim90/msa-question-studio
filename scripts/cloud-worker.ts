import { claimImport, processImport } from '../lib/cloud-worker';
import { closeCloud, safeError } from '../lib/cloud';
process.env.STUDIO_STORAGE = 'supabase';
try {
  let count = 0;
  while (count < 3) {
    const job = await claimImport();
    if (!job) break;
    await processImport(job);
    count++;
  }
  console.log('Import queue checked; operations processed:', count);
} catch (e) {
  console.error(safeError(e));
  process.exitCode = 1;
} finally {
  await closeCloud();
}
