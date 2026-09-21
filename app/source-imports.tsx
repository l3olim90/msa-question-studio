'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi } from '@/lib/client-api';
import { readServiceJSON } from '@/lib/service-response';
import type {
  ImportJob,
  ImportReview,
  ImportRecord,
} from '@/lib/source-imports';
import { Choice, type Topic } from './studio';
import { Maths } from './maths';
export function SourceImports({
  modules,
  topics,
}: {
  modules: { id: string; name: string }[];
  topics: Topic[];
}) {
  const [jobs, setJobs] = useState<ImportJob[]>([]),
    [job, setJob] = useState<ImportJob | null>(null),
    [review, setReview] = useState<ImportReview | null>(null);
  const [index, setIndex] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [advanced, setAdvanced] = useState('');
  const [importModule, setImportModule] = useState(modules[0]?.id || '');
  const [storage, setStorage] = useState<'local' | 'supabase' | null>(null);
  const [workerLastSeen, setWorkerLastSeen] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const record = review?.records[index];
  const locked = busy || job?.status !== 'review';
  const loadJobs = useCallback(
    () =>
      studioApi<{
        imports: ImportJob[];
        storage: 'local' | 'supabase';
        workerLastSeen?: string | null;
      }>('/api/imports').then((data) => {
        setJobs(data.imports);
        setStorage(data.storage);
        setWorkerLastSeen(data.workerLastSeen || null);
      }),
    [],
  );
  useEffect(() => {
    loadJobs().catch((e) => setError(e.message));
  }, [loadJobs]);
  async function open(id: string) {
    const data = await studioApi<{
      job: ImportJob;
      review: ImportReview | null;
    }>('/api/imports?id=' + id);
    setJob(data.job);
    setReview(data.review);
    setIndex(0);
    setDirty(false);
    setAdvanced('');
    setError('');
    setMessage('');
  }
  const jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    if (
      !jobId ||
      !jobStatus ||
      !['queued', 'commit_queued', 'extracting', 'committing'].includes(
        jobStatus,
      )
    )
      return;
    const timer = setInterval(() => {
      studioApi<{ job: ImportJob; review: ImportReview | null }>(
        '/api/imports?id=' + jobId,
      )
        .then((data) => {
          setJob(data.job);
          if (data.review) setReview(data.review);
          if (
            !['queued', 'commit_queued', 'extracting', 'committing'].includes(
              data.job.status,
            )
          )
            void loadJobs();
        })
        .catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [jobId, jobStatus, loadJobs]);
  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function updateRecord(patch: Partial<ImportRecord>) {
    setReview(
      (current) =>
        current && {
          ...current,
          records: current.records.map((r, i) =>
            i === index ? { ...r, ...patch } : r,
          ),
        },
    );
    setDirty(true);
  }
  function updatePaper(patch: Partial<ImportReview['papers'][number]>) {
    setReview(
      (current) =>
        current && {
          ...current,
          papers: current.papers.map((p, i) =>
            i === 0 ? { ...p, ...patch } : p,
          ),
        },
    );
    setDirty(true);
  }
  async function saveReview() {
    if (!job || !review) return;
    const data = await studioApi<{ job: ImportJob; review: ImportReview }>(
      '/api/imports',
      'PATCH',
      {
        id: job.id,
        records: review.records,
        paperVerified: review.papers[0].verified,
        paperNotes: review.papers[0].reviewer_notes,
        revision: job.review_revision,
      },
    );
    setReview(data.review);
    setJob(data.job);
    setDirty(false);
  }
  return (
    <section className="manager">
      <div className="eyebrow">SOURCE BANK</div>
      <h1>Import MST or Exam papers</h1>
      <p className="hint">
        Upload a question paper and its worked-solution PDF for an existing
        module. The configured AI provider extracts the pair; you review the
        source text, diagrams, answers and syllabus tags before adding it to the
        few-shot bank. This does not add generated questions to the approved
        repository.
      </p>
      {storage === 'supabase' && (
        <p className="hint">
          PDFs upload to private storage. Extraction and approval run in the
          background queue; scheduled workers may take several minutes to start.{' '}
          {workerLastSeen
            ? `Worker last checked: ${new Date(workerLastSeen).toLocaleString()}.`
            : 'No worker has checked the queue yet. Set up the GitHub import workflow or run pnpm worker on the configured computer.'}
        </p>
      )}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void act(async () => {
            if (storage === 'supabase') {
              for (const field of ['questionPdf', 'solutionPdf']) {
                const file = form.get(field);
                if (
                  !(file instanceof File) ||
                  !file.size ||
                  file.size > 50 * 1024 * 1024
                )
                  throw new Error(
                    'Choose both PDFs, each no larger than 50 MB.',
                  );
              }
              const data = await studioApi<{
                id: string;
                uploads: { kind: string; url: string }[];
              }>('/api/imports', 'POST', {
                action: 'prepare',
                metadata: Object.fromEntries(
                  ['module', 'kind', 'academicYear', 'semester'].map((k) => [
                    k,
                    form.get(k),
                  ]),
                ),
              });
              for (const upload of data.uploads) {
                const file = form.get(
                  upload.kind === 'questions' ? 'questionPdf' : 'solutionPdf',
                ) as File;
                const response = await fetch(upload.url, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/pdf' },
                  body: file,
                });
                if (!response.ok)
                  throw new Error(
                    'PDF upload failed. Check the connection and retry the upload.',
                  );
              }
              await studioApi('/api/imports', 'POST', {
                id: data.id,
                action: 'submit',
              });
              await open(data.id);
              await loadJobs();
              setMessage(
                'PDFs uploaded privately and queued for extraction. You can return later.',
              );
              return;
            }
            const response = await fetch('/api/imports', {
              method: 'POST',
              body: form,
            });
            const data = (await readServiceJSON(response, 'PDF upload')) as {
              id: string;
              error?: string;
            };
            if (!response.ok) throw new Error(data.error);
            await open(data.id);
            await loadJobs();
            setMessage(
              'PDFs uploaded. Extraction is processing; you can return to this screen later.',
            );
          });
        }}
      >
        <fieldset
          disabled={
            busy ||
            !storage ||
            dirty ||
            !!jobs.find((j) => ['extracting', 'committing'].includes(j.status))
          }
        >
          <div className="manager-tools">
            <Choice
              label="Module"
              name="module"
              required
              value={importModule}
              items={modules.map((m) => ({
                id: m.id,
                name: `${m.id} — ${m.name}`,
              }))}
              onChange={setImportModule}
            />
            <label className="field">
              Paper type
              <select name="kind">
                <option value="MST">MST</option>
                <option value="EXAM">Exam</option>
              </select>
            </label>
            <label htmlFor={'source-field-1'} className="field">
              Academic year
              <Input
                id={'source-field-1'}
                name="academicYear"
                required
                pattern="[0-9]{4}/[0-9]{4}"
                placeholder="2026/2027"
              />
            </label>
            <label className="field">
              Semester
              <select name="semester">
                <option>1</option>
                <option>2</option>
              </select>
            </label>
          </div>
          <div className="manager-tools">
            <label htmlFor={'source-field-2'} className="field">
              Question PDF
              <Input
                id={'source-field-2'}
                type="file"
                name="questionPdf"
                accept=".pdf,application/pdf"
                required
              />
            </label>
            <label htmlFor={'source-field-3'} className="field">
              Worked-solution PDF
              <Input
                id={'source-field-3'}
                type="file"
                name="solutionPdf"
                accept=".pdf,application/pdf"
                required
              />
            </label>
          </div>
          <p className="hint">
            Up to 50 MB per PDF and 40 pages across the pair. For longer papers,
            split into matching question/solution pairs. PDF processing requires
            the local Python packages in requirements-import.txt.
          </p>
          <Button type="submit">Upload and extract for review</Button>
        </fieldset>
      </form>
      {error && (
        <p className="error" role="alert">
          <Maths inline text={error} />
        </p>
      )}
      {message && (
        <output className="review passed">
          <Maths inline text={message} />
        </output>
      )}
      {busy && <output>Processing request…</output>}
      <div className="manager-heading">
        <h2>Import history</h2>
        <Button variant="outline" disabled={busy} onClick={() => act(loadJobs)}>
          Refresh imports
        </Button>
      </div>
      <div className="import-jobs">
        {jobs.map((item) => (
          <Button
            key={item.id}
            variant={job?.id === item.id ? 'default' : 'outline'}
            disabled={busy || dirty}
            onClick={() => act(() => open(item.id))}
          >
            {item.module} · {item.paper_id} · {item.status}
          </Button>
        ))}
      </div>
      {dirty && (
        <p className="hint">
          Save this review before switching imports. Your edits have not been
          saved yet.
        </p>
      )}
      {job && (
        <article className="repository-card">
          <h2>{job.paper_id}</h2>
          <output>
            Status: {job.status}
            {['extracting', 'committing'].includes(job.status)
              ? ' — this can take several minutes.'
              : ''}
          </output>
          {job.error && (
            <p className="error" role="alert">
              <Maths inline text={job.error} />
            </p>
          )}
          <div className="row-actions">
            <a
              href={`/api/imports/file?id=${job.id}&kind=questions`}
              target="_blank"
              rel="noreferrer"
            >
              Open original question PDF
            </a>
            <a
              href={`/api/imports/file?id=${job.id}&kind=solutions`}
              target="_blank"
              rel="noreferrer"
            >
              Open original worked solutions PDF
            </a>
          </div>
          {job.status === 'error' && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                act(async () => {
                  const next = await studioApi<{ id: string }>(
                    '/api/imports',
                    'POST',
                    { id: job.id, action: 'retry' },
                  );
                  await open(next.id);
                  await loadJobs();
                })
              }
            >
              Retry extraction from uploaded PDFs
            </Button>
          )}
          {job.status === 'committed' && (
            <p className="review passed">
              Verified questions have been added to the live source bank. The
              next reference retrieval can use them.
            </p>
          )}
          {review && record && (
            <>
              <div className="manager-tools">
                <Choice
                  label="Review question"
                  value={String(index)}
                  disabled={busy}
                  items={review.records.map((r, i) => ({
                    id: String(i),
                    name: `${r.source_question} | ${r.verified ? 'verified' : 'needs review'}`,
                  }))}
                  onChange={(value) => {
                    setIndex(Number(value));
                    setAdvanced('');
                  }}
                />
                <span>
                  {review.records.filter((r) => r.verified).length} of{' '}
                  {review.records.length} verified
                </span>
              </div>
              <details className="import-maths-preview">
                <summary>Formatted question and solutions</summary>
                <h3>
                  <Maths inline text={record.source_question} />
                </h3>
                <Maths text={record.question} />
                <h4>Main worked solution</h4>
                <Maths text={record.solution} />
                {record.alternatives.map((alternative, i) => (
                  <div key={i}>
                    <h4>Alternative solution {i + 1}</h4>
                    <Maths text={alternative.solution} />
                  </div>
                ))}
                {!!record.issues.length && (
                  <h4>Unresolved extraction issues</h4>
                )}
                {record.issues.map((issue, i) => (
                  <p key={i}>
                    <Maths inline text={issue} />
                  </p>
                ))}
                {record.reviewer_notes && (
                  <>
                    <h4>Reviewer notes</h4>
                    <Maths text={record.reviewer_notes} />
                  </>
                )}
                <p className="hint">
                  This preview reflects your edits below. Compare it with the
                  original PDFs before approving.
                </p>
              </details>
              <fieldset disabled={locked}>
                <p className="hint">
                  Question pages:{' '}
                  {record.question_crops.map((c) => c.page).join(', ')}.
                  Solution pages: {record.solution_pages.join(', ')}. Compare
                  all text and any diagrams against the original PDFs.
                </p>
                <label htmlFor={'source-field-4'} className="field">
                  Question text
                  <Textarea
                    id={'source-field-4'}
                    value={record.question}
                    onChange={(e) =>
                      updateRecord({
                        question: e.target.value,
                        verified: false,
                      })
                    }
                  />
                </label>
                <label htmlFor={'source-field-5'} className="field">
                  Main worked solution
                  <Textarea
                    id={'source-field-5'}
                    value={record.solution}
                    onChange={(e) =>
                      updateRecord({
                        solution: e.target.value,
                        verified: false,
                      })
                    }
                  />
                </label>
                <div className="manager-tools">
                  <label htmlFor={'source-field-6'} className="field">
                    Marks
                    <Input
                      id={'source-field-6'}
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={record.marks ?? ''}
                      onChange={(e) =>
                        updateRecord({
                          marks:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                          verified: false,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Difficulty
                    <select
                      value={record.difficulty}
                      onChange={(e) =>
                        updateRecord({
                          difficulty: e.target
                            .value as ImportRecord['difficulty'],
                          verified: false,
                        })
                      }
                    >
                      {['Basic', 'Intermediate', 'Challenging'].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <Choice
                    label="Topic"
                    value={record.topic_id}
                    disabled={locked}
                    items={topics.filter(
                      (t) => t.module === job.module && t.level === 'Topic',
                    )}
                    onChange={(value) =>
                      updateRecord({
                        topic_id: value,
                        subtopic_id:
                          topics.find((t) => t.parent === value)?.id || '',
                        verified: false,
                      })
                    }
                  />
                  <Choice
                    label="Primary sub-topic"
                    value={record.subtopic_id}
                    disabled={locked}
                    items={topics.filter((t) => t.parent === record.topic_id)}
                    onChange={(value) =>
                      updateRecord({ subtopic_id: value, verified: false })
                    }
                  />
                </div>
                <label htmlFor={'source-field-7'} className="field">
                  Source marking JSON (null when absent)
                  <Textarea
                    id={'source-field-7'}
                    value={record.marking_json}
                    onChange={(e) =>
                      updateRecord({
                        marking_json: e.target.value,
                        verified: false,
                      })
                    }
                  />
                </label>
                {record.alternatives.map((alternative, i) => (
                  <details key={i}>
                    <summary>Alternative solution {i + 1}</summary>
                    <label htmlFor={'source-field-8' + i} className="field">
                      Worked solution
                      <Textarea
                        id={'source-field-8' + i}
                        value={alternative.solution}
                        onChange={(e) =>
                          updateRecord({
                            alternatives: record.alternatives.map((a, j) =>
                              j === i ? { ...a, solution: e.target.value } : a,
                            ),
                            verified: false,
                          })
                        }
                      />
                    </label>
                    <label htmlFor={'source-field-9' + i} className="field">
                      Source marking JSON
                      <Textarea
                        id={'source-field-9' + i}
                        value={alternative.marking_json}
                        onChange={(e) =>
                          updateRecord({
                            alternatives: record.alternatives.map((a, j) =>
                              j === i
                                ? { ...a, marking_json: e.target.value }
                                : a,
                            ),
                            verified: false,
                          })
                        }
                      />
                    </label>
                  </details>
                ))}
                <label htmlFor={'source-field-10'} className="field">
                  Unresolved extraction issues (one per line)
                  <Textarea
                    id={'source-field-10'}
                    value={record.issues.join('\n')}
                    onChange={(e) =>
                      updateRecord({
                        issues: e.target.value.split('\n').filter(Boolean),
                        verified: false,
                      })
                    }
                  />
                </label>
                <p className="hint">
                  Correct the extraction against the PDFs, then remove resolved
                  issues and record what you checked below.
                </p>
                <label htmlFor={'source-field-11'} className="field">
                  Reviewer notes
                  <Textarea
                    id={'source-field-11'}
                    value={record.reviewer_notes}
                    onChange={(e) =>
                      updateRecord({ reviewer_notes: e.target.value })
                    }
                  />
                </label>
                <label className="subtopic-option">
                  <input
                    type="checkbox"
                    checked={record.verified}
                    onChange={(e) =>
                      updateRecord({ verified: e.target.checked })
                    }
                  />{' '}
                  I verified this question, every solution, source marks, tags,
                  and diagram crop locations.
                </label>
                <details>
                  <summary>Advanced source fields and crop locations</summary>
                  <p className="hint">
                    Use this to correct page numbers, crop boxes, question type,
                    additional tags or alternative solutions. Keep record IDs
                    and the source question label unchanged.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setAdvanced(JSON.stringify(record, null, 2))}
                  >
                    Load fields for editing
                  </Button>
                  {advanced && (
                    <>
                      <label htmlFor={'source-field-12'} className="field">
                        Source record JSON
                        <Textarea
                          id={'source-field-12'}
                          className="json-editor"
                          value={advanced}
                          onChange={(e) => setAdvanced(e.target.value)}
                        />
                      </label>
                      <Button
                        variant="outline"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(advanced);
                            if (
                              parsed.id !== record.id ||
                              parsed.paper_id !== record.paper_id ||
                              parsed.source_question !== record.source_question
                            )
                              throw new Error(
                                'Keep the source identifiers unchanged.',
                              );
                            updateRecord({ ...parsed, verified: false });
                            setAdvanced('');
                            setError('');
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Apply advanced fields
                      </Button>
                    </>
                  )}
                </details>
                <hr />
                <label htmlFor={'source-field-13'} className="field">
                  Whole paper review notes
                  <Textarea
                    id={'source-field-13'}
                    value={review.papers[0].reviewer_notes}
                    onChange={(e) =>
                      updatePaper({ reviewer_notes: e.target.value })
                    }
                  />
                </label>
                <label className="subtopic-option">
                  <input
                    type="checkbox"
                    checked={review.papers[0].verified}
                    onChange={(e) =>
                      updatePaper({ verified: e.target.checked })
                    }
                  />{' '}
                  I checked all {review.papers[0].question_page_count} question
                  pages and {review.papers[0].solution_page_count} solution
                  pages. Every source question is represented.
                </label>
                <div className="row-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      act(async () => {
                        await saveReview();
                        setMessage('Review saved locally.');
                      })
                    }
                  >
                    Save review
                  </Button>
                  <Button
                    disabled={
                      !review.papers[0].verified ||
                      !review.papers[0].reviewer_notes.trim() ||
                      review.records.some(
                        (r) =>
                          !r.verified ||
                          !r.reviewer_notes.trim() ||
                          r.issues.length > 0,
                      )
                    }
                    onClick={() =>
                      act(async () => {
                        await saveReview();
                        await studioApi('/api/imports', 'POST', {
                          id: job.id,
                          action: 'commit',
                          revision: job.review_revision,
                        });
                        await open(job.id);
                        await loadJobs();
                      })
                    }
                  >
                    Approve and add verified sources
                  </Button>
                </div>
              </fieldset>
            </>
          )}
          {job.log && (
            <details>
              <summary>Processing log</summary>
              <pre>{job.log}</pre>
            </details>
          )}
        </article>
      )}
    </section>
  );
}
