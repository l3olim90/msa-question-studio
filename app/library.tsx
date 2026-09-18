'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi, downloadFile } from '@/lib/client-api';
import type { RepositoryEntry, RepositorySummary } from '@/lib/repository';
import { desmosPng } from './desmos-graph';
import type { WorksheetContent } from '@/lib/word';

type Section = { id: string; name: string; questions: RepositorySummary[] };
export function Library({
  view,
  refresh,
  modules,
  onOpen,
  onView,
}: {
  view: string;
  refresh: number;
  modules: { id: string; name: string }[];
  onOpen: (entry: RepositoryEntry) => void;
  onView: (view: 'repository' | 'worksheet') => void;
}) {
  const [questions, setQuestions] = useState<RepositorySummary[]>([]);
  const [module, setModule] = useState(''),
    [search, setSearch] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([
    { id: 'first', name: 'Section A', questions: [] },
  ]);
  const [target, setTarget] = useState('first');
  const [title, setTitle] = useState('Practice worksheet'),
    [instructions, setInstructions] = useState(
      'Answer all questions. Show your working.',
    );
  const [includeName, setIncludeName] = useState(true),
    [includeClass, setIncludeClass] = useState(true);
  const selected = sections.flatMap((section) => section.questions);
  const load = async () => {
    const data = await studioApi<{ questions: RepositorySummary[] }>(
      '/api/repository?module=' +
        encodeURIComponent(module) +
        '&search=' +
        encodeURIComponent(search),
    );
    setQuestions(data.questions);
  };
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      studioApi<{ questions: RepositorySummary[] }>(
        '/api/repository?module=' +
          encodeURIComponent(module) +
          '&search=' +
          encodeURIComponent(search),
      )
        .then((data) => {
          if (!cancelled) {
            setQuestions(data.questions);
            setError('');
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [module, search, refresh, view]);
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
  function add(question: RepositorySummary) {
    setSections((current) =>
      current.map((section) =>
        section.id === target
          ? { ...section, questions: [...section.questions, question] }
          : section,
      ),
    );
    setMessage(
      `Added “${question.title}” to ${sections.find((section) => section.id === target)?.name}.`,
    );
  }
  function move(
    sectionIndex: number,
    questionIndex: number,
    direction: number,
  ) {
    setSections((current) =>
      current.map((section, i) => {
        if (i !== sectionIndex) return section;
        const items = [...section.questions];
        [items[questionIndex], items[questionIndex + direction]] = [
          items[questionIndex + direction],
          items[questionIndex],
        ];
        return { ...section, questions: items };
      }),
    );
  }
  async function exportPaper(lecturer: boolean) {
    await act(async () => {
      const paper = await studioApi<WorksheetContent>(
        '/api/worksheets',
        'POST',
        {
          title,
          instructions,
          includeName,
          includeClass,
          sections: sections.map((section) => ({
            name: section.name,
            questions: section.questions.map((q) => ({
              id: q.id,
              revision: q.revision,
            })),
          })),
        },
      );
      const { worksheetDocument } = await import('@/lib/word');
      const images = [];
      for (const entry of paper.sections.flatMap(
        (section) => section.questions,
      ))
        images.push(
          await Promise.all(
            entry.result.draft.diagrams.map((d) =>
              d.graph ? desmosPng(d) : Promise.resolve(new Uint8Array()),
            ),
          ),
        );
      const data = worksheetDocument(paper, images, lecturer);
      downloadFile(
        data as BlobPart,
        `${
          title
            .replace(/[<>:"/\\|?*]/g, '')
            .split('')
            .filter((c) => c.charCodeAt(0) > 31)
            .join('')
            .trim() || 'Worksheet'
        }_${lecturer ? 'lecturer' : 'student'}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      setMessage(
        `${lecturer ? 'Lecturer' : 'Student'} Word document exported with an answer key.`,
      );
    });
  }
  return (
    <section
      className="manager"
      aria-label={
        view === 'repository' ? 'Approved repository' : 'Paper assembly'
      }
    >
      <div className="manager-heading">
        <div>
          <div className="eyebrow">
            {view === 'repository' ? 'APPROVED QUESTIONS' : 'PAPER ASSEMBLY'}
          </div>
          <h1>
            {view === 'repository'
              ? 'Question repository'
              : 'Assemble a worksheet'}
          </h1>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => act(load)}>
          Refresh repository
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <output className="review passed">{message}</output>}
      {busy && <output>Preparing your request…</output>}
      {view === 'repository' ? (
        <>
          <p className="hint">
            Approved questions are saved on this app’s machine across sessions.
            Open a question to refine it; the approved version changes only when
            you approve its replacement.
          </p>
          <div className="manager-tools">
            <label className="field">
              Module
              <select
                value={module}
                onChange={(e) => setModule(e.target.value)}
              >
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={'library-field-1'} className="field">
              Search titles
              <Input
                id={'library-field-1'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="field">
              Add to worksheet section
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || 'Unnamed section'}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => onView('worksheet')}>
              Worksheet ({selected.length})
            </Button>
          </div>
          {!questions.length && (
            <p>
              No approved questions match. Generate a question, review it, and
              choose “Approve for repository”.
            </p>
          )}
          <div className="repository-list">
            {questions.map((q) => (
              <article key={q.id} className="repository-card">
                <h2>{q.title}</h2>
                <p className="hint">
                  {q.module} · {q.question_type} · {q.marks} marks · Revision{' '}
                  {q.revision} · {new Date(q.updated_at).toLocaleString()}
                </p>
                <div className="row-actions">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(async () =>
                        onOpen(
                          await studioApi<RepositoryEntry>(
                            '/api/repository?id=' + q.id,
                          ),
                        ),
                      )
                    }
                  >
                    Open to view or refine
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || selected.some((item) => item.id === q.id)}
                    onClick={() => add(q)}
                  >
                    {selected.some((item) => item.id === q.id)
                      ? 'Added to worksheet'
                      : 'Add to worksheet'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDeleting(q.id)}
                  >
                    Delete
                  </Button>
                </div>
                {deleting === q.id && (
                  <div className="error">
                    <p>
                      Delete “{q.title}” from the approved repository? It will
                      be removed from this worksheet selection. Its revision
                      history remains in the local audit database.
                    </p>
                    <div className="row-actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await studioApi('/api/repository', 'DELETE', {
                              id: q.id,
                              revision: q.revision,
                            });
                            setSections((current) =>
                              current.map((s) => ({
                                ...s,
                                questions: s.questions.filter(
                                  (item) => item.id !== q.id,
                                ),
                              })),
                            );
                            setDeleting(null);
                            await load();
                            setMessage(
                              'Question deleted from the approved repository.',
                            );
                          })
                        }
                      >
                        Delete question
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDeleting(null)}
                      >
                        Keep question
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Select approved questions from the repository, organise them into
            named sections, and set their order. Every export includes an answer
            key and an AI generation notice. Worksheet selections remain on this
            page until it is reloaded.
          </p>
          <label htmlFor={'library-field-2'} className="field">
            Worksheet title
            <Input
              id={'library-field-2'}
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="row-actions">
            <label>
              <input
                type="checkbox"
                checked={includeName}
                onChange={(e) => setIncludeName(e.target.checked)}
              />{' '}
              Name field
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeClass}
                onChange={(e) => setIncludeClass(e.target.checked)}
              />{' '}
              Class field
            </label>
          </div>
          <label htmlFor={'library-field-3'} className="field">
            Instructions for students
            <Textarea
              id={'library-field-3'}
              value={instructions}
              maxLength={5000}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          {sections.map((section, i) => (
            <article className="repository-card" key={section.id}>
              <label htmlFor={'library-field-4' + section.id} className="field">
                Section {i + 1} name
                <Input
                  id={'library-field-4' + section.id}
                  maxLength={150}
                  value={section.name}
                  onChange={(e) =>
                    setSections((current) =>
                      current.map((s) =>
                        s.id === section.id
                          ? { ...s, name: e.target.value }
                          : s,
                      ),
                    )
                  }
                />
              </label>
              <div className="row-actions">
                <Button
                  variant="outline"
                  disabled={i === 0}
                  onClick={() =>
                    setSections((current) => {
                      const next = [...current];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      return next;
                    })
                  }
                >
                  Move section up
                </Button>
                <Button
                  variant="outline"
                  disabled={i === sections.length - 1}
                  onClick={() =>
                    setSections((current) => {
                      const next = [...current];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      return next;
                    })
                  }
                >
                  Move section down
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTarget(section.id);
                    onView('repository');
                  }}
                >
                  Choose questions
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    sections.length === 1 || section.questions.length > 0
                  }
                  onClick={() => {
                    const next = sections.filter((s) => s.id !== section.id);
                    setSections(next);
                    if (target === section.id) setTarget(next[0].id);
                  }}
                >
                  Remove empty section
                </Button>
              </div>
              {!section.questions.length && (
                <p className="hint">
                  Add at least one question before exporting, or remove this
                  empty section.
                </p>
              )}
              {section.questions.map((q, j) => (
                <div className="worksheet-question" key={q.id}>
                  <strong>
                    {sections
                      .slice(0, i)
                      .reduce((n, s) => n + s.questions.length, 0) +
                      j +
                      1}
                    . {q.title} <small>({q.marks} marks)</small>
                  </strong>
                  <div className="row-actions">
                    <Button
                      variant="outline"
                      disabled={j === 0}
                      onClick={() => move(i, j, -1)}
                      aria-label={`Move ${q.title} up`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      disabled={j === section.questions.length - 1}
                      onClick={() => move(i, j, 1)}
                      aria-label={`Move ${q.title} down`}
                    >
                      ↓
                    </Button>
                    <select
                      aria-label={`Move ${q.title} to section`}
                      value={section.id}
                      onChange={(e) => {
                        const destination = e.target.value;
                        setSections((current) =>
                          current.map((s) => ({
                            ...s,
                            questions:
                              s.id === destination
                                ? [...s.questions, q]
                                : s.questions.filter(
                                    (item) => item.id !== q.id,
                                  ),
                          })),
                        );
                      }}
                    >
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSections((current) =>
                          current.map((s) => ({
                            ...s,
                            questions: s.questions.filter(
                              (item) => item.id !== q.id,
                            ),
                          })),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </article>
          ))}
          <div className="row-actions">
            <Button
              variant="outline"
              disabled={sections.length >= 20}
              onClick={() =>
                setSections((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    name: `Section ${String.fromCharCode(65 + current.length)}`,
                    questions: [],
                  },
                ])
              }
            >
              Add section
            </Button>
            <strong>
              {selected.length} questions ·{' '}
              {selected.reduce((n, q) => n + q.marks, 0)} marks
            </strong>
          </div>
          <p className="hint">
            Student copy: questions and answer key. Lecturer copy: questions,
            answer key, full worked solutions and proposed marking allocations.
            Older questions without a concise key use their main solution in the
            answer key.
          </p>
          <div className="row-actions">
            <Button
              disabled={
                busy ||
                !title.trim() ||
                sections.some((s) => !s.name.trim() || !s.questions.length)
              }
              onClick={() => exportPaper(false)}
            >
              Export student Word
            </Button>
            <Button
              disabled={
                busy ||
                !title.trim() ||
                sections.some((s) => !s.name.trim() || !s.questions.length)
              }
              onClick={() => exportPaper(true)}
            >
              Export lecturer Word
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
