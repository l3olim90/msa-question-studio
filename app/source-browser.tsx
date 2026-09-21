'use client';
/* oxlint-disable next/no-img-element -- Authenticated source crops and inline diagrams must use their original URLs. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  variation,
  onVariation,
}: {
  references: Ref[];
  selected: string;
  onSelect: (id: string) => void;
  onBrowse: () => void;
  loading: boolean;
  disabled: boolean;
  loaded: boolean;
  error: string;
  variation: { numbers: boolean; context: boolean };
  onVariation: (v: { numbers: boolean; context: boolean }) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = references.filter((r) =>
    (r.label + ' ' + r.question).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="source-browser">
      <Button
        variant="outline"
        disabled={disabled || loading}
        onClick={onBrowse}
      >
        {loading ? 'Loading source questions…' : 'Browse source questions'}
      </Button>
      <p className="hint">
        Sources load only on request. Changing topic or sub-topics requires
        browsing again.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loaded && (
        <>
          <label className="field" htmlFor="source-filter">
            Filter source questions
            <Input
              id="source-filter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Question text or paper"
            />
          </label>
          <p className="hint">
            {filtered.length} of {references.length} compatible sources
          </p>
          <section
            className="source-scroll"
            aria-label="Source question list"
          >
            {filtered.map((ref) => (
              <article
                className={`source-card ${selected === ref.id ? 'selected' : ''}`}
                key={ref.id}
              >
                <label className="subtopic-option">
                  <input
                    type="radio"
                    name="source-question"
                    checked={selected === ref.id}
                    onChange={() => onSelect(ref.id)}
                  />
                  <strong>{ref.label}</strong>
                </label>
                <p className="hint">
                  {ref.difficulty} ·{' '}
                  {ref.totalMarks
                    ? ref.totalMarks + ' marks'
                    : 'Marks unstated'}
                </p>
                <details>
                  <summary>View source question and solution</summary>
                  <Maths text={ref.question} />
                  {ref.screenshots.map((page) => (
                    <a
                      key={page.page}
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        loading="lazy"
                        src={page.url}
                        alt={`${ref.label}, page ${page.page}`}
                      />
                    </a>
                  ))}
                  <h4>Source solution</h4>
                  <Maths text={ref.solution} />
                  {ref.images.map((img) => (
                    <img
                      key={img.name}
                      loading="lazy"
                      src={img.url}
                      alt={`${ref.label} diagram`}
                    />
                  ))}
                </details>
              </article>
            ))}
            {!filtered.length && (
              <p>
                No compatible source questions found. Adjust the topic,
                sub-topics or filter.
              </p>
            )}
          </section>
        </>
      )}
      <p>
        <strong>Optional variation preferences</strong>
      </p>
      <label className="subtopic-option" htmlFor="variation-numbers">
        <Checkbox
          id="variation-numbers"
          checked={variation.numbers}
          onCheckedChange={(numbers) => onVariation({ ...variation, numbers })}
        />
        Change numbers / formulas
      </label>
      <label className="subtopic-option" htmlFor="variation-context">
        <Checkbox
          id="variation-context"
          checked={variation.context}
          onCheckedChange={(context) => onVariation({ ...variation, context })}
        />
        Change context
      </label>
      <p className="hint">
        Leave both unchecked to let AI choose. The main mathematical method is
        retained and all dependent answers are recalculated.
      </p>
    </div>
  );
}
