'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studioApi, downloadFile } from '@/lib/client-api';
import type { RepositoryEntry, RepositorySummary } from '@/lib/repository';
import { desmosPng } from './desmos-graph';
import type { WorksheetContent } from '@/lib/word';
import type {
  SavedWorksheet,
  SavedWorksheetSummary,
} from '@/lib/saved-worksheets';
import { reorderQuestion } from '@/lib/worksheet';
import { Download, GripVertical } from 'lucide-react';
import { Choice, type Topic } from './studio';
import { Maths } from './maths';

type Section = { id: string; name: string; questions: RepositorySummary[] };
export function Library({
  view,
  active,
  refresh,
  modules,
  topics,
  onOpen,
  onView,
}: {
  view: string;
  active: boolean;
  refresh: number;
  modules: { id: string; name: string }[];
  topics: Topic[];
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
  const [saved, setSaved] = useState<SavedWorksheetSummary[]>([]);
  const [savedId, setSavedId] = useState('');
  const [opened, setOpened] = useState<SavedWorksheet | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify({
      title: 'Practice worksheet',
      instructions: 'Answer all questions. Show your working.',
      includeName: true,
      includeClass: true,
      sections: [{ name: 'Section A', questions: [] }],
    }),
  );
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const configuration = {
    title,
    instructions,
    includeName,
    includeClass,
    sections: sections.map((s) => ({
      name: s.name,
      questions: s.questions.map((q) => ({ id: q.id, revision: q.revision })),
    })),
  };
  const dirty = savedSnapshot !== JSON.stringify(configuration);
  const validSave =
    title.trim() &&
    sections.every((s) => s.name.trim()) &&
    selected.length <= 100;
  const exportDisabled =
    busy ||
    !title.trim() ||
    sections.some((s) => !s.name.trim() || !s.questions.length);
  async function loadSaved() {
    const data = await studioApi<{ worksheets: SavedWorksheetSummary[] }>(
      '/api/worksheets/saved',
    );
    setSaved(data.worksheets);
  }
  useEffect(() => {
    if (!active || view !== 'worksheet') return;
    let cancelled = false;
    studioApi<{ worksheets: SavedWorksheetSummary[] }>('/api/worksheets/saved')
      .then((data) => {
        if (!cancelled) setSaved(data.worksheets);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [active, view]);
  async function savePaper(asNew = false) {
    await act(async () => {
      const value = await studioApi<SavedWorksheet>(
        '/api/worksheets/saved',
        'POST',
        {
          configuration,
          ...(!asNew && opened
            ? { id: opened.id, revision: opened.revision }
            : {}),
        },
      );
      setOpened(value);
      setSavedId(value.id);
      setSavedSnapshot(JSON.stringify(value.configuration));
      await loadSaved();
      await load();
      setMessage('Worksheet saved. You can reopen it in a future session.');
    });
  }
  async function openPaper(id = savedId) {
    if (
      dirty &&
      !window.confirm('Open this worksheet and discard unsaved changes?')
    )
      return;
    await act(async () => {
      const [value, repository] = await Promise.all([
        studioApi<SavedWorksheet>('/api/worksheets/saved?id=' + id),
        studioApi<{ questions: RepositorySummary[] }>('/api/repository'),
      ]);
      const c = value.configuration;
      let changed = false;
      const loaded = c.sections.map((s) => ({
        id: crypto.randomUUID(),
        name: s.name,
        questions: s.questions.map((q) => {
          const current = repository.questions.find((item) => item.id === q.id);
          if (!current || current.revision !== q.revision) changed = true;
          return {
            ...(current || {
              id: q.id,
              title: 'Unavailable question — remove this card',
              module: '',
              topic: '',
              difficulty: 'Unavailable',
              marks: 0,
              question_type: '',
              created_at: '',
              updated_at: '',
            }),
            revision: q.revision,
          };
        }),
      }));
      setSections(loaded);
      setTarget(loaded[0].id);
      setTitle(c.title);
      setInstructions(c.instructions);
      setIncludeName(c.includeName);
      setIncludeClass(c.includeClass);
      setOpened(value);
      setSavedId(value.id);
      onView('worksheet');
      setSavedSnapshot(JSON.stringify(c));
      setMessage(
        changed
          ? 'Worksheet opened. Some questions changed or were deleted. Use Refresh selected questions to accept current approved revisions, then save again.'
          : 'Worksheet opened. Edit it or export again.',
      );
    });
  }
  async function refreshSelected() {
    await act(async () => {
      const data = await studioApi<{ questions: RepositorySummary[] }>(
        '/api/repository',
      );
      setSections((current) =>
        current.map((s) => ({
          ...s,
          questions: s.questions.flatMap((q) => {
            const latest = data.questions.find((item) => item.id === q.id);
            return latest ? [latest] : [];
          }),
        })),
      );
      setMessage(
        'Selected questions updated to their current approved revisions. Deleted questions were removed. Save to keep these changes.',
      );
    });
  }
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
    if (!active) return;
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
  }, [active, module, search, refresh, view]);
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
  function drop(sectionId: string, position: number) {
    if (dragged)
      setSections((current) =>
        reorderQuestion(current, dragged, sectionId, position),
      );
    setDragged(null);
    setDropTarget(null);
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
        {view === 'repository' ? (
          <Button variant="outline" disabled={busy} onClick={() => act(load)}>
            Refresh repository
          </Button>
        ) : (
          <div className="export-control">
            <Button
              className="export-word"
              disabled={exportDisabled}
              onClick={() => exportPaper(false)}
            >
              <Download size={20} aria-hidden="true" /> Export student Word
            </Button>
            <Button
              className="export-word"
              disabled={exportDisabled}
              onClick={() => exportPaper(true)}
            >
              <Download size={20} aria-hidden="true" /> Export lecturer Word
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          <Maths inline text={error} />
        </p>
      )}
      {message && (
        <output className="manager-message passed">
          <Maths inline text={message} />
        </output>
      )}
      {busy && (
        <output className="manager-progress">Preparing your request…</output>
      )}
      {view === 'repository' ? (
        <>
          <p className="hint">
            Approved questions are saved in the app database across sessions.
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
            <Choice
              label="Add to worksheet section"
              value={target}
              disabled={busy}
              items={sections.map((s) => ({
                id: s.id,
                name: s.name || 'Unnamed section',
              }))}
              onChange={setTarget}
            />
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
                <h2>
                  <Maths inline text={q.title} />
                </h2>
                <p className="hint">
                  {q.module} · {q.question_type} · {q.marks} marks · Revision{' '}
                  {q.revision} · {new Date(q.updated_at).toLocaleString()}
                </p>
                <details className="worksheet-usage">
                  <summary>
                    Used in {q.worksheets?.length || 0} saved worksheets
                  </summary>
                  <p className="hint">
                    Saved worksheet membership; unsaved assemblies and
                    downloaded files are not tracked.
                  </p>
                  {q.worksheets?.map((use) => (
                    <div key={use.id + use.section}>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => openPaper(use.id)}
                      >
                        <Maths inline text={use.title} />
                      </Button>
                      <span>
                        {' '}
                        | <Maths inline text={use.section} /> | question
                        revision {use.questionRevision}
                        {use.questionRevision !== q.revision
                          ? ' (earlier revision)'
                          : ''}
                      </span>
                    </div>
                  ))}
                  {!q.worksheets?.length && (
                    <p>No saved worksheet uses this question yet.</p>
                  )}
                </details>
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
                      Delete “<Maths inline text={q.title} />” from the approved
                      repository? It will be removed from this worksheet
                      selection. Its revision history remains in the audit
                      database.
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
            key and an AI generation notice. Save your worksheet to reopen it
            across sessions. Drag a card by its grip to change its order or
            section; the position and section menus also work with a keyboard or
            touch.
          </p>
          <p className="hint">
            Student copy: questions and answer key. Lecturer copy: each question
            followed by its main and alternative solutions and marking
            allocations, with an answer key at the end. Older questions without
            a concise key use their main solution in the answer key.
          </p>
          <fieldset disabled={busy}>
            <section
              className="repository-card"
              aria-labelledby="saved-worksheets-heading"
            >
              <h2 id="saved-worksheets-heading">Saved worksheets</h2>
              <Choice
                label="Choose a saved worksheet"
                value={savedId}
                disabled={busy}
                items={[
                  { id: '', name: 'Choose a saved worksheet' },
                  ...saved.map((s) => ({
                    id: s.id,
                    name: `${s.title} | ${new Date(s.updated_at).toLocaleString()}`,
                  })),
                ]}
                onChange={setSavedId}
              />
              <div className="row-actions">
                <Button
                  variant="outline"
                  disabled={!savedId}
                  onClick={() => openPaper()}
                >
                  Open worksheet
                </Button>
                <Button variant="outline" onClick={() => act(loadSaved)}>
                  Refresh list
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      dirty &&
                      !window.confirm(
                        'Start a new worksheet and discard unsaved changes?',
                      )
                    )
                      return;
                    const blank = {
                      title: 'Practice worksheet',
                      instructions: 'Answer all questions. Show your working.',
                      includeName: true,
                      includeClass: true,
                      sections: [{ name: 'Section A', questions: [] }],
                    };
                    setTitle(blank.title);
                    setInstructions(blank.instructions);
                    setIncludeName(true);
                    setIncludeClass(true);
                    setSections([{ id: 'first', ...blank.sections[0] }]);
                    setTarget('first');
                    setOpened(null);
                    setSavedId('');
                    setSavedSnapshot(JSON.stringify(blank));
                    setMessage('New worksheet ready.');
                    setError('');
                  }}
                >
                  New worksheet
                </Button>
                <Button disabled={!validSave} onClick={() => savePaper()}>
                  {opened ? 'Save changes' : 'Save worksheet'}
                </Button>
                {opened && (
                  <Button
                    variant="outline"
                    disabled={!validSave}
                    onClick={() => savePaper(true)}
                  >
                    Save as new worksheet
                  </Button>
                )}
                {opened && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Delete this saved worksheet? Its questions stay in the repository.',
                        )
                      )
                        return;
                      void act(async () => {
                        await studioApi('/api/worksheets/saved', 'DELETE', {
                          id: opened.id,
                          revision: opened.revision,
                        });
                        setOpened(null);
                        setSavedId('');
                        setSavedSnapshot('');
                        await loadSaved();
                        await load();
                        setMessage(
                          'Saved worksheet deleted. The current assembly is still available to save as a new worksheet.',
                        );
                      });
                    }}
                  >
                    Delete saved worksheet
                  </Button>
                )}
              </div>
              <p className="hint">
                <Maths
                  inline
                  text={
                    opened
                      ? `Editing “${opened.title}” · ${dirty ? 'Unsaved changes' : 'Saved'}`
                      : 'New worksheet · Not yet saved'
                  }
                />
              </p>
            </section>
            <section
              className="repository-card"
              aria-labelledby="worksheet-details-heading"
            >
              <h2 id="worksheet-details-heading">Worksheet details</h2>
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
            </section>
            <section
              className="repository-card"
              aria-labelledby="worksheet-sections-heading"
            >
              <div>
                <h2 id="worksheet-sections-heading">Define / add sections</h2>
                <p className="hint">
                  Name your sections, then choose where repository questions are
                  added.
                </p>
              </div>
              <div className="manager-tools">
                <Choice
                  label="Section to fill"
                  value={target}
                  disabled={busy}
                  items={sections.map((section) => ({
                    id: section.id,
                    name: `${section.name || 'Unnamed section'} | ${section.questions.length} questions`,
                  }))}
                  onChange={setTarget}
                />
                <label className="field" htmlFor="section-setup-name">
                  Section name
                  <Input
                    id="section-setup-name"
                    maxLength={150}
                    value={sections.find((s) => s.id === target)?.name || ''}
                    onChange={(e) =>
                      setSections((current) =>
                        current.map((s) =>
                          s.id === target ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <div className="row-actions">
                <Button
                  variant="outline"
                  disabled={sections.length >= 20}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setSections((current) => [
                      ...current,
                      {
                        id,
                        name: `Section ${String.fromCharCode(65 + current.length)}`,
                        questions: [],
                      },
                    ]);
                    setTarget(id);
                  }}
                >
                  Add section
                </Button>
                <Button variant="outline" onClick={() => onView('repository')}>
                  Choose repository questions
                </Button>
              </div>
            </section>
            {sections.map((section, i) => (
              <article className="repository-card" key={section.id}>
                <label
                  htmlFor={'library-field-4' + section.id}
                  className="field"
                >
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
                  <div
                    className={`worksheet-question${dragged === q.id ? ' is-dragging' : ''}${dropTarget === q.id ? ' drop-target' : ''}`}
                    key={q.id}
                    onDragOver={(e) => {
                      if (dragged && dragged !== q.id) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTarget(q.id);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragged || dragged === q.id) return;
                      const bounds = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > bounds.top + bounds.height / 2;
                      const without = section.questions.filter(
                        (item) => item.id !== dragged,
                      );
                      drop(
                        section.id,
                        without.findIndex((item) => item.id === q.id) +
                          (after ? 1 : 0),
                      );
                    }}
                  >
                    <button
                      type="button"
                      className="drag-handle"
                      draggable={!busy}
                      aria-label={`Drag ${q.title} to reorder. You can also use the position menu.`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', q.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragged(q.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                    >
                      <GripVertical size={20} aria-hidden="true" /> Drag to
                      reorder
                    </button>
                    <strong>
                      {sections
                        .slice(0, i)
                        .reduce((n, s) => n + s.questions.length, 0) +
                        j +
                        1}
                      . <Maths inline text={q.title} />{' '}
                      <small>({q.marks} marks)</small>
                    </strong>
                    <p className="question-metadata">
                      {q.module} ·{' '}
                      <Maths
                        inline
                        text={
                          topics.find(
                            (t) => t.id === q.topic && t.module === q.module,
                          )?.name ||
                          q.topic ||
                          'Topic unavailable'
                        }
                      />{' '}
                      · {q.difficulty} · {q.question_type}
                    </p>
                    <div className="row-actions">
                      <label>
                        Position{' '}
                        <select
                          aria-label={`Position of ${q.title}`}
                          value={j}
                          onChange={(e) =>
                            setSections((current) =>
                              reorderQuestion(
                                current,
                                q.id,
                                section.id,
                                Number(e.target.value),
                              ),
                            )
                          }
                        >
                          {section.questions.map((item, index) => (
                            <option key={item.id} value={index}>
                              {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Choice
                        label="Move to section"
                        value={section.id}
                        disabled={busy}
                        items={sections.map((s) => ({
                          id: s.id,
                          name: s.name,
                        }))}
                        onChange={(destination) => {
                          if (destination === section.id) return;
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
                      />
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
                <div
                  className={`worksheet-drop-zone${dropTarget === section.id ? ' drop-target' : ''}`}
                  onDragOver={(e) => {
                    if (dragged) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropTarget(section.id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(section.id, section.questions.length);
                  }}
                >
                  {dragged
                    ? 'Drop here to place at the end of this section'
                    : 'Drag questions here to move them into this section'}
                </div>
              </article>
            ))}
            <div className="row-actions">
              <Button
                variant="outline"
                disabled={!selected.length}
                onClick={refreshSelected}
              >
                Refresh selected questions
              </Button>
              <strong>
                {selected.length} questions ·{' '}
                {selected.reduce((n, q) => n + q.marks, 0)} marks
              </strong>
            </div>
          </fieldset>
        </>
      )}
    </section>
  );
}
