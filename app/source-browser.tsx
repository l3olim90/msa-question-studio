'use client';
/* oxlint-disable next/no-img-element -- Authenticated source crops and inline diagrams must use their original URLs. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Ref } from '@/lib/history';
import { Maths } from './maths';

export function SourceBrowser({
  references,
  selected,
  onSelect,
  onBrowse,
  loading,
  disabled,
  loaded,
  error,
  progress,
}: {
  references: Ref[];
  selected: string;
  onSelect: (id: string) => void;
  onBrowse: () => void;
  loading: boolean;
  disabled: boolean;
  loaded: boolean;
  error: string;
  progress: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = references.filter((ref) =>
    (ref.label + ' ' + ref.question)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const chosen = references.find((ref) => ref.id === selected);
  return (
    <div className="source-browser" aria-busy={loading}>
      <div className="source-browser-heading">
        <div>
          <h3>Choose a source question</h3>
          <p className="hint">
            Preview and select a question here. Set optional variations and
            generate using the left panel.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={disabled || loading}
          onClick={onBrowse}
        >
          {loading
            ? 'Loading sources...'
            : loaded
              ? 'Refresh sources'
              : 'Browse source questions'}
        </Button>
      </div>
      {loading && <output className="source-progress">{progress}</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded && !loading && !error && (
        <p className="source-empty">
          Click Browse source questions to load matches for your module,
          question type, topic and difficulty.
        </p>
      )}
      {loaded && !loading && (
        <>
          <div className="source-browser-toolbar">
            <label className="field" htmlFor="source-filter">
              Filter source questions
              <Input
                id="source-filter"
                value={search}
                disabled={disabled}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Question text or paper"
              />
            </label>
            <output className="hint">
              {filtered.length} of {references.length} matching sources
            </output>
          </div>
          <div className="source-picker-grid">
            <fieldset className="source-choice-list" disabled={disabled}>
              <legend className="sr-only">
                Select a source question to preview
              </legend>
              {filtered.map((ref) => (
                <label
                  className={`source-choice ${selected === ref.id ? 'selected' : ''}`}
                  key={ref.id}
                  aria-label={ref.label}
                >
                  <input
                    type="radio"
                    name="source-question"
                    checked={selected === ref.id}
                    onChange={() => onSelect(ref.id)}
                  />
                  <span>
                    <strong>{ref.label}</strong>
                    <span className="hint">
                      {ref.difficulty} |{' '}
                      {ref.totalMarks
                        ? `${ref.totalMarks} marks`
                        : 'AI will assign marks'}
                    </span>
                  </span>
                </label>
              ))}
              {!filtered.length && (
                <p className="source-empty">
                  {references.length
                    ? 'No questions match this text filter. Clear it to see all sources.'
                    : 'No sources match these selections. Change the module, question type, topic or difficulty and browse again.'}
                </p>
              )}
            </fieldset>
            <article
              className="source-preview"
              aria-label="Selected source question preview"
            >
              {chosen ? (
                <div key={chosen.id}>
                  <div className="eyebrow">SELECTED SOURCE</div>
                  <h4>{chosen.label}</h4>
                  <p className="hint">
                    {chosen.difficulty} |{' '}
                    {chosen.totalMarks
                      ? `${chosen.totalMarks} marks`
                      : 'Marks unstated; AI will assign marks'}
                  </p>
                  <Maths text={chosen.question} />
                  {!!chosen.screenshots.length && (
                    <details>
                      <summary>Original source pages</summary>
                      <div className="source-pages">
                        {chosen.screenshots.map((page) => (
                          <a
                            key={page.page}
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              loading="lazy"
                              src={page.url}
                              alt={`${chosen.label}, page ${page.page}`}
                            />
                            <span className="hint">
                              Open page {page.page} at full size
                            </span>
                          </a>
                        ))}
                      </div>
                    </details>
                  )}
                  <details>
                    <summary>Source solution and diagrams</summary>
                    <Maths text={chosen.solution} />
                    {chosen.alternatives.map((solution, index) => (
                      <div key={index}>
                        <h4>Alternative {index + 1}</h4>
                        <Maths text={solution} />
                      </div>
                    ))}
                    {chosen.images.map((img) => (
                      <img
                        key={img.name}
                        loading="lazy"
                        src={img.url}
                        alt={`${chosen.label} diagram`}
                      />
                    ))}
                  </details>
                </div>
              ) : (
                <p className="source-empty">
                  Select a question from the list to preview it here.
                </p>
              )}
            </article>
          </div>
        </>
      )}
    </div>
  );
}
