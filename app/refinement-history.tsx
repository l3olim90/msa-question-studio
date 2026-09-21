'use client';
/* oxlint-disable next/no-img-element -- Version comparison renders local SVG data, without image optimisation. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Result } from '@/lib/history';
import type { Draft } from '@/lib/schema';
import { svgDiagram } from '@/lib/diagram';
import { Maths } from './maths';
function VersionPreview({ draft }: { draft: Draft }) {
  return (
    <div>
      <h4>{draft.title}</h4>
      <p className="hint">
        {draft.total_marks} marks · {draft.question_type}
      </p>
      <Maths text={draft.question} />
      {draft.parts.map((p) => (
        <div key={p.label}>
          <strong>{p.label}</strong>
          <Maths text={p.prompt} />
        </div>
      ))}
      {draft.options.map((o) => (
        <div key={o.label}>
          <strong>{o.label}.</strong>
          <Maths text={o.text} />
        </div>
      ))}
      {draft.diagrams
        .filter((d) => d.placement === 'question')
        .map((d, i) => (
          <figure key={i}>
            <img
              src={
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(svgDiagram(d))
              }
              alt={d.caption || 'Question diagram'}
            />
            <figcaption>{d.caption}</figcaption>
          </figure>
        ))}
      <details>
        <summary>Answer, solutions and marking</summary>
        <Maths text={draft.answer_key} />
        {draft.solutions.map((s, i) => (
          <div key={i}>
            <h4>{s.title}</h4>
            <Maths text={s.content} />
            {s.marking.map((m, j) => (
              <div key={j}>
                <strong>
                  {m.part} · {m.marks} marks
                </strong>
                <Maths text={m.criterion} />
              </div>
            ))}
          </div>
        ))}
        {draft.diagrams
          .filter((d) => d.placement === 'solution')
          .map((d, i) => (
            <img
              key={i}
              src={
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(svgDiagram(d))
              }
              alt={d.caption || 'Solution diagram'}
            />
          ))}
      </details>
    </div>
  );
}
export function RefinementHistory({
  result,
  busy,
  onRestore,
}: {
  result: Result;
  busy: boolean;
  onRestore: (index: number) => void;
}) {
  const [selected, setSelected] = useState(0);
  const version = result.previousVersions[selected];
  return (
    <details className="refinement-history">
      <summary>
        Refinement history · {result.previousVersions.length + 1} versions
      </summary>
      <p className="hint">
        Compare an earlier version with the working draft. Restoring keeps
        subsequent refinements. Approving a question saves this history with it.
      </p>
      {!version ? (
        <p>
          No refinements yet. The original version will be kept when you refine
          this question.
        </p>
      ) : (
        <>
          <label className="field">
            Earlier version
            <select
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {result.previousVersions.map((v, i) => (
                <option key={i} value={i}>
                  Version {i + 1} · before {v.change.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <p>
            <strong>Change after this version:</strong> {version.change}
          </p>
          <p className="hint">{new Date(version.savedAt).toLocaleString()}</p>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => onRestore(selected)}
          >
            Restore version {selected + 1}
          </Button>
          <div className="revision-comparison">
            <section aria-label="Earlier question version">
              <h3>Version {selected + 1}</h3>
              <VersionPreview draft={version.result.draft} />
            </section>
            <section aria-label="Current question version">
              <h3>Current working draft</h3>
              <VersionPreview draft={result.draft} />
            </section>
          </div>
        </>
      )}
    </details>
  );
}
