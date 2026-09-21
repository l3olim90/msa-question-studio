'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { studioApi, downloadFile } from '@/lib/client-api';
type Trace = {
  id: string;
  operation: string;
  module: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  prompt_version: string | null;
  calls: number;
};
function readableFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (key.endsWith('_json') && typeof value === 'string') {
        try {
          return [key.slice(0, -5), JSON.parse(value)];
        } catch {
          /* retain the stored value */
        }
      }
      return [key, value];
    }),
  );
}
export function Activity() {
  const [traces, setTraces] = useState<Trace[]>([]),
    [offset, setOffset] = useState(0),
    [error, setError] = useState('');
  const [detail, setDetail] = useState<{
    trace: Record<string, unknown>;
    spans: Record<string, unknown>[];
  } | null>(null);
  const load = useCallback(
    () =>
      studioApi<{ traces: Trace[] }>('/api/traces?offset=' + offset)
        .then((d) => {
          setTraces(d.traces);
          setError('');
        })
        .catch((e) => setError(e.message)),
    [offset],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="manager">
      <div className="manager-heading">
        <div>
          <div className="eyebrow">TRACE HISTORY</div>
          <h1>Generation activity</h1>
        </div>
        <Button variant="outline" onClick={load}>
          Refresh
        </Button>
      </div>
      <p className="hint">
        Trace details show prompt identity, model calls, token usage and status.
        Prompt text, request content, model responses and internal errors are
        excluded from this view and its downloads. A “running” trace after
        an app restart may indicate an interrupted request.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="repository-list">
        {traces.map((trace) => (
          <article className="repository-card" key={trace.id}>
            <strong>
              {trace.operation} · {trace.module || 'Module not yet resolved'} ·{' '}
              {trace.status}
            </strong>
            <p className="hint">
              {new Date(trace.started_at).toLocaleString()} · {trace.calls}{' '}
              model calls · {trace.prompt_version || 'No prompt loaded'}
            </p>
            <Button
              variant="outline"
              onClick={() =>
                studioApi<typeof detail>('/api/traces?id=' + trace.id)
                  .then(setDetail)
                  .catch((e) => setError(e.message))
              }
            >
              Inspect trace
            </Button>
          </article>
        ))}
      </div>
      {!traces.length && <p>No generation traces on this page yet.</p>}
      <div className="row-actions">
        <Button
          variant="outline"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Newer
        </Button>
        <Button
          variant="outline"
          disabled={traces.length < 50}
          onClick={() => setOffset(offset + 50)}
        >
          Older
        </Button>
      </div>
      {detail && (
        <article className="repository-card">
          <div className="row-actions">
            <h2>Trace details</h2>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  JSON.stringify(detail, null, 2),
                  `trace-${String(detail.trace.id)}.json`,
                  'application/json',
                )
              }
            >
              Download trace JSON
            </Button>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Close details
            </Button>
          </div>
          <pre>{JSON.stringify(readableFields(detail.trace), null, 2)}</pre>
          {detail.spans.map((span) => (
            <details key={String(span.id)}>
              <summary>
                {String(span.name)} · {String(span.provider)} ·{' '}
                {String(span.model)} · {String(span.status)}
              </summary>
              <pre>{JSON.stringify(readableFields(span), null, 2)}</pre>
            </details>
          ))}
        </article>
      )}
    </section>
  );
}
