import { z } from 'zod';
import { store } from '@/lib/store';
import { authorize, apiError, HttpError } from '@/lib/security';
export async function GET(request: Request) {
  try {
    await authorize(request);
    const query = new URL(request.url).searchParams;
    const db = store;
    if (query.has('id')) {
      const id = z.uuid().parse(query.get('id'));
      const trace = await db.get('SELECT * FROM traces WHERE id=?', id);
      if (!trace) throw new HttpError(404, 'Trace not found.');
      return Response.json(
        {
          trace,
          spans: await db.all(
              'SELECT * FROM trace_spans WHERE trace_id=? ORDER BY started_at,id',
            id),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const offset = Math.max(0, Number(query.get('offset')) || 0);
    return Response.json(
      {
        traces: await db.all(`SELECT id,operation,module,started_at,ended_at,status,prompt_version,question_id,
      (SELECT count(*) FROM trace_spans WHERE trace_id=traces.id) AS calls FROM traces ORDER BY started_at DESC LIMIT 50 OFFSET ?`,offset),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
