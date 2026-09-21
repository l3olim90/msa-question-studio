import type { ImportJob } from './source-imports';
// Worker logs (including historical provider errors) are maintainer diagnostics.
// Keep them out of the public import API, just like raw generation traces.
export function publicImportJob(row: ImportJob): ImportJob {
  return {
    id: row.id,
    module: row.module,
    paper_id: row.paper_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    review_revision: row.review_revision,
    error: row.error
      ? 'The import was interrupted or could not complete. Retry the import or ask the app maintainer to inspect the server diagnostics.'
      : null,
    log: null,
  };
}
