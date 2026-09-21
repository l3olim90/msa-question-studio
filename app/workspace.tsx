'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { generationRequest } from '@/lib/service-response';
import { sourceQuestionsRequest, SOURCE_REQUEST_ATTEMPTS } from '@/lib/source-request';
import { DesmosGraph, desmosPng } from './desmos-graph';
import { Choice, type Topic } from './studio';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowUpRight,
  LoaderCircle,
  Sun,
  Moon,
  BookOpen,
} from 'lucide-react';
import { Maths } from './maths';
import { RefinementHistory } from './refinement-history';
import { TerminologyRules } from './terminology-rules';
import { SourceBrowser } from './source-browser';
import 'katex/dist/katex.min.css';
import { svgDiagram } from '@/lib/diagram';
import { type Brief } from '@/lib/schema';
import { formulasForBrief } from '@/lib/formula-catalog';
import { sourceRequest } from '@/lib/source-selection';
import { APP_VERSION } from '@/lib/version';
import { configurationIssues } from '@/lib/configuration';
import { studioApi } from '@/lib/client-api';
import type { RepositoryEntry, RepositorySummary } from '@/lib/repository';
import { Library } from './library';
import { Activity } from './activity';
import { SourceImports } from './source-imports';
import {
  HISTORY_KEY,
  emptyHistory,
  readHistory,
  addQuestions,
  updateQuestion,
  selectQuestion,
  deselectQuestion,
  draftSetup,
  resultSchema,
  recordRefinement,
  restoreVersion,
  type QuestionHistory,
  type Result,
  type Ref,
} from '@/lib/history';

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace({
  topics,
  modules,
}: {
  topics: Topic[];
  modules: { id: string; name: string }[];
}) {
  const [dark, setDark] = useState(false),
    [questionType, setQuestionType] = useState<'MCQ' | 'Structured'>(
      'Structured',
    ),
    [creative, setCreative] = useState(false),
    [multiple, setMultiple] = useState(false),
    [autoParts, setAutoParts] = useState(false),
    [partCount, setPartCount] = useState('2');
  useEffect(() => {
    let theme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    try {
      const saved = localStorage.getItem('msa-theme');
      if (saved) theme = saved === 'dark';
    } catch {}
    setDark(theme);
    document.documentElement.classList.toggle('dark', theme);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('msa-theme', next ? 'dark' : 'light');
    } catch {}
  }
  const [module, setModule] = useState(modules[0]?.id || '');
  const [candidates, setCandidates] = useState<Result[]>([]),
    [candidateIndex, setCandidateIndex] = useState(0);
  const [topic, setTopic] = useState(
      topics.find((t) => t.module === modules[0]?.id && t.level === 'Topic')
        ?.id || '',
    ),
    [subs, setSubs] = useState<string[]>(
      topics
        .filter(
          (t) =>
            t.parent ===
            topics.find(
              (t) => t.module === modules[0]?.id && t.level === 'Topic',
            )?.id,
        )
        .slice(0, 1)
        .map((t) => t.id),
    ),
    [marks, setMarks] = useState('10'),
    [difficulty, setDifficulty] = useState<Brief['difficulty']>('Basic'),
    [spec, setSpec] = useState(''),
    [edit, setEdit] = useState(''),
    [busy, setBusy] = useState(''),
    [generationError, setGenerationError] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<Result | null>(null),
    [refs, setRefs] = useState<Ref[]>([]),
    [solution, setSolution] = useState(0),
    [diagramIndex, setDiagramIndex] = useState(0),
    [shapeIndex, setShapeIndex] = useState(0),
    [manual, setManual] = useState(false);
  const [history, setHistory] = useState<QuestionHistory | null>(null);
  const [historyWarning, setHistoryWarning] = useState('');
  const [view, setView] = useState<
    'generate' | 'repository' | 'worksheet' | 'sources' | 'activity'
  >('generate');
  const [generationMode, setGenerationMode] = useState<'new' | 'similar'>(
    'new',
  );
  const [sourceLoad, setSourceLoad] = useState<{ key: string; loading: boolean; progress: string; error: string } | null>(null);
  const sourceAbort = useRef<AbortController | null>(null);
  const sourcePanel = useRef<HTMLElement | null>(null);
  const [selectedSource, setSelectedSource] = useState('');
  const [sourceKey, setSourceKey] = useState('');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [variation, setVariation] = useState({
    numbers: false,
    context: false,
  });
  const [nonRoutine, setNonRoutine] = useState(false);
  const [useFormulaSheet, setUseFormulaSheet] = useState(true);
  const [repositoryRefresh, setRepositoryRefresh] = useState(0),
    [approvalMessage, setApprovalMessage] = useState('');
  const [bindings, setBindings] = useState<
    Record<string, { id: string; revision: number; saved: string }>
  >({});
  const currentKey = history?.activeId + ':' + candidateIndex;
  const binding = bindings[currentKey];
  const resultSnapshot = useMemo(() => JSON.stringify(result), [result]);
  const unchangedApproved =
    !!binding && resultSnapshot === binding.saved;
  function clearSourceBrowser() {
    sourceAbort.current?.abort();
    sourceAbort.current = null;
    setSourceLoad(null);
    setRefs([]);
    setSelectedSource('');
    setSourceKey('');
    setSourcePickerOpen(false);
  }
  function restoreDraftSetup(saved: Result) {
    const setup = draftSetup(saved);
    const original = setup.brief;
    clearSourceBrowser();
    setGenerationMode(setup.generationMode);
    setModule(original.module);
    setQuestionType(original.questionType);
    setTopic(original.topic);
    setSubs(original.subtopics);
    setMarks(String(original.totalMarks));
    setDifficulty(original.difficulty);
    setSpec(original.specifications);
    setCreative(original.creativeContext);
    setMultiple(original.multipleParts);
    setAutoParts(!!original.autoParts);
    setPartCount(String(original.partCount));
    setNonRoutine(original.nonRoutine);
    setUseFormulaSheet(original.useFormulaSheet);
    setVariation(setup.variation);
    if (setup.sourceQuestionId && setup.references.length) {
      setRefs(setup.references);
      setSelectedSource(setup.sourceQuestionId);
      setSourceKey(sourceRequest(original));
    }
  }
  function resetWorkingDraft() {
    // Generation, refinement and diagram edits already update this draft list.
    setHistory((current) => current ? deselectQuestion(current) : current);
    setCandidates([]);
    setCandidateIndex(0);
    setResult(null);
    setSolution(0);
    setDiagramIndex(0);
    setShapeIndex(0);
    setManual(false);
    setEdit('');
    setError('');
    setGenerationError(false);
    setApprovalMessage('');
    clearSourceBrowser();
  }
  function openRepository(entry: RepositoryEntry) {
    restoreDraftSetup(entry.result);
    const batchId = crypto.randomUUID();
    setHistory((current) =>
      addQuestions(current || emptyHistory(), [entry.result], batchId),
    );
    setBindings((current) => ({
      ...current,
      [batchId + ':0']: {
        id: entry.id,
        revision: entry.revision,
        saved: JSON.stringify(entry.result),
      },
    }));
    setCandidates([entry.result]);
    setCandidateIndex(0);
    setResult(entry.result);
    setSourcePickerOpen(false);
    setSolution(0);
    setDiagramIndex(0);
    setShapeIndex(0);
    setEdit('');
    setError('');
    setManual(!!entry.result.manual);
    setApprovalMessage(
      'Opened approved revision ' +
        entry.revision +
        '. Refine it, then approve a replacement when ready.',
    );
    setView('generate');
  }
  async function approve() {
    if (!result) return;
    setBusy('Saving approved question...');
    setError('');
    setGenerationError(false);
    try {
      const entry = await studioApi<RepositorySummary>(
        '/api/repository',
        'POST',
        {
          result,
          approved: true,
          id: binding?.id,
          revision: binding?.revision,
        },
      );
      setBindings((current) => ({
        ...current,
        [currentKey]: {
          id: entry.id,
          revision: entry.revision,
          saved: resultSnapshot,
        },
      }));
      setRepositoryRefresh((current) => current + 1);
      setApprovalMessage(
        'Approved revision ' + entry.revision + ' saved to the repository.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    let saved = emptyHistory();
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) {
        saved = readHistory(raw);
        sessionStorage.removeItem(HISTORY_KEY);
        setHistoryWarning(
          'Recovered drafts from the previous session history. Approve the questions you want to keep in the repository.',
        );
      }
    } catch {
      setHistoryWarning(
        'Saved session history could not be restored. New questions can still be generated.',
      );
    }
    setHistory(saved);
    const batch = saved.batches.find((b) => b.id === saved.activeId);
    if (batch) {
      restoreDraftSetup(batch.results[saved.candidateIndex]);
      setCandidates(batch.results);
      setCandidateIndex(saved.candidateIndex);
      setResult(batch.results[saved.candidateIndex]);
      setSourcePickerOpen(false);
      setManual(!!batch.results[saved.candidateIndex].manual);
    }
  }, []);
  function openHistory(id: string, index: number) {
    if (busy || !history) return;
    const batch = history.batches.find((b) => b.id === id);
    if (!batch?.results[index]) return;
    restoreDraftSetup(batch.results[index]);
    setHistory(selectQuestion(history, id, index));
    setCandidates(batch.results);
    setApprovalMessage('');
    setCandidateIndex(index);
    setResult(batch.results[index]);
    setSourcePickerOpen(false);
    setManual(!!batch.results[index].manual);
    setSolution(0);
    setDiagramIndex(0);
    setShapeIndex(0);
    setEdit('');
    setError('');
    setApprovalMessage('');
  }
  const newStructured =
    questionType === 'Structured' && generationMode === 'new';
  const brief: Brief = {
    module,
    topic,
    subtopics:
      questionType === 'MCQ' || generationMode === 'similar'
        ? topics.filter((t) => t.parent === topic).map((t) => t.id)
        : subs,
    questionType,
    creativeContext: newStructured && creative,
    useFormulaSheet:
      newStructured &&
      difficulty === 'Challenging' &&
      useFormulaSheet &&
      !!formulasForBrief({ module, subtopics: subs }),
    nonRoutine:
      newStructured &&
      difficulty === 'Challenging' &&
      nonRoutine,
    autoParts: newStructured && multiple && autoParts,
    multipleParts: newStructured && multiple,
    partCount: newStructured && multiple && !autoParts ? Number(partCount) : 2,
    totalMarks:
      questionType === 'MCQ' ? 2 : generationMode === 'similar' ? 10 : difficulty === 'Basic' ? 10 : Number(marks),
    difficulty: questionType === 'MCQ' && generationMode === 'new' ? 'Intermediate' : difficulty,
    specifications: generationMode === 'similar' ? '' : spec,
  };
  const availableFormulas = formulasForBrief(brief);
  const configIssues = configurationIssues(brief, topics);
  const validParts =
    !newStructured ||
    !multiple ||
    autoParts ||
    (Number.isInteger(Number(partCount)) &&
      Number(partCount) >= 2 &&
      Number(partCount) <= 6);
  const validMarks =
    generationMode === 'similar' ||
    questionType === 'MCQ' ||
    (marks.trim() !== '' &&
      Number.isSafeInteger(Number(marks)) &&
      Number(marks) >= 1);
  const subOptions = topics.filter((t) => t.parent === topic);
  const allSelected =
    subOptions.length > 0 && subOptions.every((t) => subs.includes(t.id));
  const requestId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const sourceFilter = {
    module,
    topic,
    questionType,
    difficulty,
  };
  const browseKey = sourceRequest(sourceFilter);
  const referencesLoading = sourceLoad?.key === browseKey && sourceLoad.loading;
  const referenceError = sourceLoad?.key === browseKey ? sourceLoad.error : '';
  const sourceProgress = sourceLoad?.key === browseKey ? sourceLoad.progress : '';
  const selectedReference = sourceKey === browseKey ? refs.find(ref => ref.id === selectedSource) : undefined;
  const sourceSelectionValid = !!selectedReference;
  useEffect(() => () => sourceAbort.current?.abort(), [browseKey, generationMode, view]);
  function focusSources() {
    sourcePanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sourcePanel.current?.focus({ preventScroll: true });
  }
  async function browseSources() {
    if (configIssues.length || referencesLoading || busy) return;
    setSourcePickerOpen(true);
    sourceAbort.current?.abort();
    const controller = new AbortController();
    sourceAbort.current = controller;
    setSelectedSource('');
    const key = browseKey;
    setSourceLoad({ key, loading: true, progress: 'Loading source questions...', error: '' });
    focusSources();
    try {
      const data = await sourceQuestionsRequest(key, controller.signal, ({ attempt, retrying }) => {
        if (sourceAbort.current === controller && !controller.signal.aborted)
          setSourceLoad({ key, loading: true, error: '', progress: `${retrying ? 'Retrying automatically' : 'Loading source questions'} (attempt ${attempt} of ${SOURCE_REQUEST_ATTEMPTS})...` });
      });
      if (controller.signal.aborted || sourceAbort.current !== controller) return;
      setRefs(data.references);
      setSourceKey(key);
    } catch (e) {
      if (!controller.signal.aborted && sourceAbort.current === controller)
        setSourceLoad({ key, loading: false, progress: '', error: (e as Error).message });
    } finally {
      if (sourceAbort.current === controller) {
        sourceAbort.current = null;
        setSourceLoad(current => current?.key === key ? { ...current, loading: false, progress: '' } : current);
      }
    }
  }
  useEffect(() => {
    setError('');
  }, [
    module,
    topic,
    subs,
    difficulty,
    spec,
    marks,
    questionType,
    generationMode,
    creative,
    multiple,
    partCount,
    autoParts,
  ]);
  async function generate(isEdit = false) {
    setGenerationError(true);
    setApprovalMessage('');
    if (!isEdit && configIssues.length) {
      setError(
        configIssues.map((i) => i.field + ': ' + i.recommendation).join(' '),
      );
      return;
    }
    if (!isEdit && (!validMarks || !validParts || !brief.subtopics.length)) {
      setError(
        'Select at least one sub-topic, valid marks and a whole-number part count from 2 to 6 when enabled.',
      );
      return;
    }
    if (!isEdit && generationMode === 'similar' && !sourceSelectionValid) {
      setError(
        'Browse source questions and choose a source for the current selections.',
      );
      return;
    }
    if (isEdit && !edit.trim()) {
      setError('Describe the change you want.');
      return;
    }
    const id = ++requestId.current;
    abort.current = new AbortController();
    setBusy(
      isEdit
        ? 'Revising and checking your question…'
        : questionType === 'MCQ'
          ? 'Generating and checking three MCQ candidates…'
          : 'Checking marks feasibility, generating and reviewing…',
    );
    setError('');
    try {
      const batchId = isEdit ? history!.activeId! : crypto.randomUUID();
      const d: any = await generationRequest(
        JSON.stringify({
          brief: isEdit ? result?.effectiveBrief : generationMode === 'similar' ? sourceFilter : brief,
          mode: isEdit ? 'new' : generationMode,
          sourceQuestionId: isEdit
            ? result?.sourceQuestionId
            : generationMode === 'similar'
              ? selectedSource
              : undefined,
          variation: isEdit
            ? result?.similarVariation
            : generationMode === 'similar'
              ? variation
              : undefined,
          sessionId: history?.sessionId,
          questionId: batchId + ':' + (isEdit ? candidateIndex : 0),
          previous: isEdit ? result?.draft : undefined,
          edit: isEdit ? edit : undefined,
        }),
        abort.current.signal,
        () =>
          setBusy(
            'The service response was interrupted. Retrying the same question brief automatically…',
          ),
      );
      const generated: Result[] = (
        isEdit || !d.candidates ? [d] : d.candidates
      ).map((item: unknown) => resultSchema.parse(item));
      if (isEdit && result)
        generated[0] = recordRefinement(result, generated[0], edit);
      if (isEdit && result?.generationMode === 'similar') {
        generated[0].generationMode = 'similar';
        generated[0].sourceQuestionId = result.sourceQuestionId;
      }
      if (!isEdit && questionType === 'MCQ' && generated.length !== 3)
        throw new Error(
          'Three MCQ candidates were not returned. Please retry.',
        );
      if (id === requestId.current) {
        if (isEdit) {
          setHistory((current) =>
            current ? updateQuestion(current, generated[0]) : current,
          );
          setCandidates((current) =>
            current.map((item, i) =>
              i === candidateIndex ? generated[0] : item,
            ),
          );
          setResult(generated[0]);
        } else {
          setHistory((current) =>
            addQuestions(current || emptyHistory(), generated, batchId),
          );
          setCandidates(generated);
          setCandidateIndex(0);
          setResult(generated[0]);
        }
        setSolution(0);
        setSourcePickerOpen(false);
        setManual(false);
        setDiagramIndex(0);
        setShapeIndex(0);
        setEdit('');
      }
    } catch (e) {
      if (id === requestId.current && (e as Error).name !== 'AbortError')
        setError((e as Error).message);
    } finally {
      if (id === requestId.current) {
        setBusy('');
        abort.current = null;
      }
    }
  }
  function restoreRefinement(index: number) {
    if (!result || busy) return;
    const restored = restoreVersion(result, index);
    setResult(restored);
    setSourcePickerOpen(false);
    setHistory((current) =>
      current ? updateQuestion(current, restored) : current,
    );
    setCandidates((current) =>
      current.map((item, i) => (i === candidateIndex ? restored : item)),
    );
    setSolution(0);
    setDiagramIndex(0);
    setShapeIndex(0);
    setManual(!!restored.manual);
    setEdit('');
    setApprovalMessage(
      'Earlier version restored as the working draft. Later refinements remain available for comparison.',
    );
  }
  function viewCandidate(index: number) {
    if (busy || !candidates[index]) return;
    restoreDraftSetup(candidates[index]);
    setHistory((current) =>
      current?.activeId
        ? selectQuestion(current, current.activeId, index)
        : current,
    );
    setApprovalMessage('');
    setCandidateIndex(index);
    setResult(candidates[index]);
    setSourcePickerOpen(false);
    setSolution(0);
    setDiagramIndex(0);
    setShapeIndex(0);
    setManual(!!candidates[index].manual);
    setEdit('');
    setError('');
  }
  async function exportWord() {
    setGenerationError(false);
    if (!result) return;
    setBusy('Preparing editable Word equations…');
    setError('');
    try {
      const { wordDocument } = await import('@/lib/word');
      const images = await Promise.all(
        result.draft.diagrams.map((d) =>
          d.graph ? desmosPng(d) : Promise.resolve(new Uint8Array()),
        ),
      );
      const data = wordDocument(
        result.draft,
        images,
        result.references.map((r) => r.label),
        result.effectiveBrief.module,
      );
      save(
        data as BlobPart,
        [
          result.effectiveBrief.module,
          result.draft.question_type,
          topics.find((t) => t.id === result.effectiveBrief.topic)?.name ||
            result.effectiveBrief.topic,
          ...(result.draft.question_type === 'Structured'
            ? [result.effectiveBrief.difficulty]
            : []),
        ]
          .map((v) => v.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim())
          .join('_') + '.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    } catch (e) {
      setError(`Word export failed: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }
  function changeShape(field: string, value: string) {
    if (!result) return;
    const draft = structuredClone(result.draft);
    const s = draft.diagrams[diagramIndex].shapes[shapeIndex];
    (s as any)[field] =
      field === 'text'
        ? value
        : Math.max(
            0,
            Math.min(
              field === 'y' || field === 'y2' || field === 'height' ? 500 : 800,
              Number(value) || 0,
            ),
          );
    const updated = { ...result, draft, manual: true };
    setHistory((current) =>
      current ? updateQuestion(current, updated) : current,
    );
    setResult(updated);
    setCandidates((current) =>
      current.map((item, i) => (i === candidateIndex ? updated : item)),
    );
    setManual(true);
  }

  const d = result?.draft,
    sol = d?.solutions[solution],
    shownRefs = result?.generationMode === 'similar'
      ? result.references.filter(ref => ref.id === result.sourceQuestionId)
      : result?.references || [],
    diagram = d?.diagrams[diagramIndex],
    shape = diagram?.shapes[shapeIndex];
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <BookOpen size={30} />
          </span>
          <div>
            <strong>MSA Question Studio</strong>
            <small>Assessment question generator · Version {APP_VERSION}</small>
          </div>
        </div>
        <Button
          className="theme-toggle"
          variant="outline"
          onClick={toggleTheme}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={dark}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
          <span>{dark ? 'Light mode' : 'Dark mode'}</span>
        </Button>
      </header>
      <nav className="app-nav" aria-label="Studio sections">
        {(
          [
            ['generate', 'Generate and refine'],
            ['repository', 'Approved repository'],
            ['worksheet', 'Paper assembly'],
            ['sources', 'Import sources'],
            ['activity', 'Activity'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={view === id ? 'default' : 'outline'}
            aria-current={view === id ? 'page' : undefined}
            disabled={!!busy}
            onClick={() => setView(id)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div
        style={
          view === 'repository' || view === 'worksheet'
            ? undefined
            : { display: 'none' }
        }
      >
        <Library
          active={view === 'repository' || view === 'worksheet'}
          view={view === 'worksheet' ? 'worksheet' : 'repository'}
          refresh={repositoryRefresh}
          modules={modules}
          topics={topics}
          onOpen={openRepository}
          onView={setView}
        />
      </div>
      <div style={view === 'sources' ? undefined : { display: 'none' }}>
        <SourceImports modules={modules} topics={topics} />
      </div>
      {view === 'activity' && <Activity />}
      <div
        className="workspace"
        style={view === 'generate' ? undefined : { display: 'none' }}
      >
        <aside className="setup">
          <div className="eyebrow">QUESTION BRIEF</div>
          <h1>What question will you generate?</h1>
          <Choice
            label="Generation mode"
            value={generationMode}
            disabled={!!busy || !history}
            items={[
              { id: 'new', name: 'New question from the brief' },
              { id: 'similar', name: 'Similar question from a source' },
            ]}
            onChange={(v) => {
              if (busy || !history || v === generationMode) return;
              resetWorkingDraft();
              setGenerationMode(v as 'new' | 'similar');
            }}
          />
          <p className="hint">
            {generationMode === 'similar'
              ? 'Browse the knowledge base, choose a source question and adapt it into a separate draft.'
              : 'Create an original question using your specifications and source examples for guidance.'}
          </p>
          <fieldset disabled={!!busy || !history}>
            <Choice
              label="Module"
              value={module}
              items={modules}
              onChange={(v) => {
                if (busy || !history || v === module) return;
                resetWorkingDraft();
                setModule(v);
                const t = topics.find(
                  (t) => t.module === v && t.level === 'Topic',
                );
                setTopic(t?.id || '');
                setSubs(
                  topics
                    .filter((s) => s.parent === t?.id)
                    .slice(0, 1)
                    .map((s) => s.id),
                );
              }}
            />
            <Choice
              label="Question type"
              value={questionType}
              items={[
                { id: 'MCQ', name: 'MCQ' },
                { id: 'Structured', name: 'Structured' },
              ]}
              onChange={(v) => {
                if (busy || !history || v === questionType) return;
                resetWorkingDraft();
                setQuestionType(v as 'MCQ' | 'Structured');
              }}
            />
            {questionType === 'MCQ' && (
              <p className="hint">
                {generationMode === 'similar'
                  ? 'Three conceptual candidates adapted from your selected source at its difficulty. Four options, one correct answer, 2 marks each.'
                  : 'Three conceptual candidates from the main topic. Four options, one correct answer, Intermediate or above, 2 marks each.'}
              </p>
            )}
            <Choice
              label="Topic"
              value={topic}
              items={topics.filter(
                (t) => t.level === 'Topic' && t.module === module,
              )}
              onChange={(v) => {
                setTopic(v);
                setSubs(
                  topics
                    .filter((t) => t.parent === v)
                    .slice(0, 1)
                    .map((t) => t.id),
                );
              }}
            />
            {newStructured && (
              <div className="field">
                <span id="subtopics-label">Sub-topics</span>
                <div
                  className="subtopic-list"
                  role="group"
                  aria-labelledby="subtopics-label"
                >
                  <label className="subtopic-option all">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={subs.length > 0 && !allSelected}
                      onCheckedChange={(checked) =>
                        setSubs(checked ? subOptions.map((t) => t.id) : [])
                      }
                    />
                    All sub-topics
                  </label>
                  {subOptions.map((t) => (
                    <label className="subtopic-option" key={t.id}>
                      <Checkbox
                        checked={subs.includes(t.id)}
                        onCheckedChange={(checked) =>
                          setSubs((current) =>
                            checked
                              ? [...current, t.id]
                              : current.filter((id) => id !== t.id),
                          )
                        }
                      />
                      <Maths inline text={t.name} />
                    </label>
                  ))}
                </div>
                <span className="hint">
                  {subs.length} selected. All covers every active sub-topic
                  within this topic.
                </span>
                {!subs.length && (
                  <span role="alert">Select at least one sub-topic.</span>
                )}
              </div>
            )}
            {(questionType === 'Structured' || generationMode === 'similar') && (
              <>
                <Choice
                  label="Difficulty"
                  value={difficulty}
                  items={['Basic', 'Intermediate', 'Challenging'].map((id) => ({
                    id,
                    name: id,
                  }))}
                  onChange={(v) => {
                    setDifficulty(v as Brief['difficulty']);
                    if (v === 'Challenging') setMarks('15');
                    if (v === 'Basic') setMarks('10');
                  }}
                />
                {newStructured && <label className="field">
                  Total marks
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={difficulty === 'Basic' ? '10' : marks}
                    disabled={difficulty === 'Basic'}
                    aria-invalid={!validMarks}
                    aria-describedby="marks-help"
                    onChange={(e) => setMarks(e.target.value)}
                  />
                  <span id="marks-help" className="hint">
                    {difficulty === 'Basic'
                      ? 'Basic structured questions always total 10 marks.'
                      : validMarks
                        ? 'Whole numbers, minimum 1. Exact marks are prioritised; any necessary adjustments are explained with the question.'
                        : 'Enter a whole number of marks of at least 1.'}
                  </span>
                </label>}
              </>
            )}
            {newStructured && difficulty === 'Challenging' && (
              <div>
                <label className="subtopic-option" htmlFor="brief-non-routine">
                  <Checkbox
                    id="brief-non-routine"
                    checked={nonRoutine}
                    onCheckedChange={setNonRoutine}
                  />
                  Include at least one non-routine task
                </label>
                <p className="hint">
                  Less guidance; students interpret the question and choose the
                  concept or method. Challenge comes from reasoning, with fair
                  marks for it.
                </p>
                {availableFormulas && (
                  <>
                    <label className="subtopic-option" htmlFor="brief-formula-sheet">
                      <Checkbox
                        id="brief-formula-sheet"
                        checked={useFormulaSheet}
                        onCheckedChange={setUseFormulaSheet}
                      />
                      Students may use the MSA formula sheet
                    </label>
                    <p className="hint">
                      Only formulas mapped to these EM1 sub-topics are available
                      to generation. Formulas from other modules do not extend the
                      syllabus.
                    </p>
                    <details>
                      <summary>
                        View relevant formula-sheet entries (
                        {availableFormulas.entries.length})
                      </summary>
                      <a
                        href="/api/formula-sheet"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open full MSA formula sheet (PDF)
                      </a>
                      {availableFormulas.entries.map((f) => (
                        <div key={f.id}>
                          <p>
                            <strong><Maths inline text={f.name} /></strong> | sheet page {f.page}
                          </p>
                          <Maths text={'\\[' + f.latex + '\\]'} />
                          <p className="hint"><Maths inline text={f.conditions} /></p>
                        </div>
                      ))}
                    </details>
                  </>
                )}
                {!availableFormulas && (
                  <p className="hint">
                    No formula-sheet entries are mapped to these sub-topics.
                  </p>
                )}
              </div>
            )}
            <>
              {newStructured && (
                <label className="subtopic-option">
                  <Checkbox checked={creative} onCheckedChange={setCreative} />
                  Use a creative context
                </label>
              )}
            </>
            {newStructured && creative && (
              <p className="context-notice">
                Check the creative context yourself for validity and
                reasonableness, including the story, dimensions and
                configuration. AI checks plausibility but do not establish
                real-world facts.
              </p>
            )}
            {newStructured && (
              <>
                <label className="subtopic-option">
                  <Checkbox checked={multiple} onCheckedChange={setMultiple} />
                  Include multiple parts
                </label>
                {multiple && (
                  <>
                    <label className="subtopic-option">
                      <Checkbox
                        checked={autoParts}
                        onCheckedChange={setAutoParts}
                      />
                      Let AI decide the number of parts (2–6)
                    </label>
                    <label className="field">
                      Number of parts
                      <Input
                        disabled={autoParts}
                        type="number"
                        min={2}
                        max={6}
                        step={1}
                        value={partCount}
                        onChange={(e) => setPartCount(e.target.value)}
                        aria-invalid={!validParts}
                      />
                      <span className="hint">
                        2–6 parts. Each part asks one answerable task.
                      </span>
                    </label>
                  </>
                )}
              </>
            )}
            {generationMode === 'new' ? (
              <label className="field">
                Additional specifications
                <Textarea
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  maxLength={3000}
                  placeholder="For example: two linked parts, use an electrical engineering context…"
                />
                <span className="hint">Use professional educational wording. Context is checked before generation.</span>
              </label>
            ) : (
              <p className="hint">
                The first similar question uses the source's sub-topics,
                difficulty and marks, including Basic sources. AI assigns marks
                when the source has none; MCQs remain 2 marks. Request any changes
                to difficulty, marks or structure afterward using Refine draft
                and recheck.
              </p>
            )}
            {generationMode === 'similar' && (
              <>
                <div className="source-browse-launcher">
                  <Button variant="outline" disabled={!!configIssues.length || referencesLoading} onClick={browseSources} aria-controls="source-references">
                    {referencesLoading ? 'Loading sources...' : 'Browse source questions'}
                  </Button>
                  <p className="hint">Browse, preview and select in Source references in the main window.</p>
                  {selectedReference && <p className="source-selected-summary"><strong>Selected:</strong> <Maths inline text={selectedReference.label} /></p>}
                  {(referencesLoading || selectedReference || referenceError) && <Button variant="link" onClick={focusSources} aria-controls="source-references">View source references</Button>}
                </div>
                <fieldset className="source-variation-preferences">
                  <legend>Optional variation preferences</legend>
                  <div className="source-variation-options">
                    <label className="subtopic-option" htmlFor="variation-numbers">
                      <Checkbox
                        id="variation-numbers"
                        checked={variation.numbers}
                        onCheckedChange={(numbers) => setVariation({ ...variation, numbers })}
                      />
                      Change numbers / formulas
                    </label>
                    <label className="subtopic-option" htmlFor="variation-context">
                      <Checkbox
                        id="variation-context"
                        checked={variation.context}
                        onCheckedChange={(context) => setVariation({ ...variation, context })}
                      />
                      Change context
                    </label>
                  </div>
                  <p className="hint">
                    Leave both unchecked to let AI choose. The source&apos;s main
                    mathematical method is retained.
                  </p>
                </fieldset>
              </>
            )}
            {configIssues.length > 0 && (
              <div className="error" role="alert">
                <strong>Check the question configuration</strong>
                {configIssues.map((issue, i) => (
                  <p key={i}>
                    <Maths inline text={`${issue.field}: ${issue.error} Recommendation: ${issue.recommendation}`} />
                  </p>
                ))}
              </div>
            )}
            <Button
              className="generate"
              onClick={() => generate()}
              disabled={
                (generationMode === 'similar' && (!sourceSelectionValid || referencesLoading)) ||
                !!configIssues.length ||
                !validMarks ||
                !validParts ||
                !brief.subtopics.length
              }
            >
              <ArrowUpRight size={18} />
              {generationMode === 'similar'
                ? questionType === 'MCQ'
                  ? 'Generate 3 similar MCQs'
                  : 'Generate similar question'
                : questionType === 'MCQ'
                  ? 'Generate 3 new MCQs'
                  : 'Generate new question'}
            </Button>
          </fieldset>
          {busy && abort.current && (
            <Button
              variant="outline"
              className="cancel"
              onClick={() => {
                abort.current?.abort();
                requestId.current++;
                setBusy('');
              }}
            >
              Stop waiting
            </Button>
          )}
          <p className="hint">
            New generation uses this brief. Edits and export apply to the
            displayed question.
          </p>
        </aside>
        <section className="desk">
          <details className="question-history">
            <summary>
              Drafts this visit ·{' '}
              {history?.batches.reduce(
                (n, batch) => n + batch.results.length,
                0,
              ) || 0}{' '}
              questions
            </summary>
            <p className="hint">
              Working drafts are temporary. Approve questions for the repository
              to keep them across visits. Refinements here do not change an
              approved entry until you approve its replacement.
              {' '}Changing generation mode, module or question type clears the
              preview and keeps your questions here to reopen. Reopening a draft
              also restores its original generation settings in the left panel.
            </p>
            {!history?.batches.length && (
              <p>No questions generated in this session yet.</p>
            )}
            <div className="history-list">
              {history?.batches.toReversed().flatMap((batch) =>
                batch.results.map((item, index) => (
                  <Button
                    key={batch.id + ':' + index}
                    variant={
                      history.activeId === batch.id && candidateIndex === index
                        ? 'default'
                        : 'outline'
                    }
                    disabled={!!busy}
                    aria-current={
                      history.activeId === batch.id && candidateIndex === index
                        ? 'true'
                        : undefined
                    }
                    onClick={() => openHistory(batch.id, index)}
                  >
                    <strong>
                      <Maths inline text={item.draft.title} />
                    </strong>
                    <span>
                      {item.effectiveBrief.module} · {item.draft.question_type}
                      {batch.results.length > 1
                        ? ' ' + (index + 1) + '/3'
                        : ''}{' '}
                      ·{' '}
                      {new Date(batch.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </Button>
                )),
              )}
            </div>
          </details>
          {historyWarning && (
            <p role="alert" className="error">
              <Maths inline text={historyWarning} />
            </p>
          )}
          {candidates.length === 3 && (
            <nav className="candidate-nav" aria-label="MCQ candidates">
              <Button
                variant="outline"
                disabled={!!busy || candidateIndex === 0}
                onClick={() => viewCandidate(candidateIndex - 1)}
              >
                <ChevronLeft size={18} />
                Previous
              </Button>
              <div>
                <strong aria-live="polite">
                  MCQ {candidateIndex + 1} of 3
                </strong>
                <div className="candidate-pages">
                  {candidates.map((_, i) => (
                    <Button
                      key={i}
                      variant={i === candidateIndex ? 'default' : 'outline'}
                      disabled={!!busy}
                      aria-label={`View MCQ ${i + 1}`}
                      aria-current={i === candidateIndex ? 'page' : undefined}
                      onClick={() => viewCandidate(i)}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                disabled={!!busy || candidateIndex === 2}
                onClick={() => viewCandidate(candidateIndex + 1)}
              >
                Next
                <ChevronRight size={18} />
              </Button>
            </nav>
          )}
          <div className="desk-heading">
            <div>
              <div className="eyebrow">
                {d ? 'WORKING DRAFT' : 'QUESTION PREVIEW'}
              </div>
              <h2>
                <Maths inline text={d?.title || 'Your next question starts here.'} />
              </h2>
            </div>
            {d && (
              <div className="export-control">
                <Button
                  disabled={!!busy || unchangedApproved}
                  onClick={approve}
                >
                  {unchangedApproved
                    ? 'Approved in repository'
                    : binding
                      ? 'Approve replacement'
                      : 'Approve for repository'}
                </Button>
                <Button
                  className="export-word"
                  onClick={exportWord}
                  disabled={!!busy}
                >
                  <Download size={20} />
                  {d.question_type === 'MCQ'
                    ? 'Export this MCQ (.docx)'
                    : 'Export Word (.docx)'}
                </Button>
              </div>
            )}
          </div>
          {d && (
            <div className="edit-box">
              <label className="field">
                Refine this question
                <Textarea
                  value={edit}
                  onChange={(e) => setEdit(e.target.value)}
                  maxLength={3000}
                  placeholder="For example: simplify part (b), or change the context while retaining 10 marks…"
                />
                <span className="hint">Describe the question changes using professional educational language.</span>
              </label>
              <Button
                disabled={!!busy || !edit.trim()}
                onClick={() => generate(true)}
              >
                <RefreshCw size={16} />
                Refine draft and recheck
              </Button>
            </div>
          )}
          {result && (
            <RefinementHistory
              key={currentKey}
              result={result}
              busy={!!busy}
              onRestore={restoreRefinement}
            />
          )}
          {result && (
            <TerminologyRules
              key={result.effectiveBrief.module}
              module={result.effectiveBrief.module}
              disabled={!!busy}
            />
          )}
          {result &&
            (result.effectiveBrief.creativeContext ||
              (result.review.context_summary &&
                !/not applicable/i.test(result.review.context_summary))) && (
              <p className="context-notice">
                Review this context yourself for validity and reasonableness,
                including dimensions and configuration. The AI plausibility
                check does not verify external facts.
              </p>
            )}
          {approvalMessage && (
            <p className="review passed" role="status">
              <Maths inline text={approvalMessage} />
            </p>
          )}
          {binding && !unchangedApproved && (
            <p className="hint">
              This working draft has changes. The repository still contains
              approved revision {binding.revision}. Choose “Approve replacement”
              to publish these changes to the repository.
            </p>
          )}
          {result?.formulaSheet && (
            <p className="hint">
              Formula sheet available to students: <Maths inline text={result.formulaSheet.title} /> |{' '}
              {result.formulaSheet.entries.length} relevant entries.{' '}
              <a href="/api/formula-sheet" target="_blank" rel="noreferrer">
                View sheet
              </a>
            </p>
          )}
          {result?.sourceQuestionId && (
            <p className="hint">
              Similar-question base:{' '}
              <Maths inline text={result.references.find((r) => r.id === result.sourceQuestionId)
                ?.label || result.sourceQuestionId} />
            </p>
          )}
          {result?.auditWarning && (
            <p className="error" role="alert">
              <Maths inline text={result.auditWarning} />
            </p>
          )}
          {error && (
            <div role="alert" className="error">
              {generationError && (
                <strong>Question could not be generated.</strong>
              )}
              <p>
                <Maths inline text={error} />
              </p>
            </div>
          )}
          {result &&
            result.draft.question_type === 'Structured' &&
            (result.feasibility.omitted_subtopics.length > 0 ||
              result.effectiveBrief.totalMarks !== result.brief.totalMarks ||
              result.effectiveBrief.difficulty !== result.brief.difficulty ||
              result.feasibility.specification_adjustments.length > 0) && (
              <div role="alert" className="error">
                <strong>Configuration adjustments and recommendations</strong>
                {result.draft.question_type === 'Structured' &&
                  result.feasibility.omitted_subtopics.map((item) => (
                    <p key={item.id}>
                      <strong>
                        <Maths inline text={topics.find((t) => t.id === item.id)?.name || item.id} />{' '}
                        omitted:
                      </strong>{' '}
                      <Maths inline text={item.reason} />
                    </p>
                  ))}
                {result.effectiveBrief.totalMarks !==
                result.brief.totalMarks ? (
                  <p>
                    <strong>
                      {result.generationMode === 'similar'
                        ? `Marks after generation/refinement: ${result.effectiveBrief.totalMarks}.`
                        : `Marks: requested ${result.brief.totalMarks}, generated ${result.effectiveBrief.totalMarks}.`}
                    </strong>{' '}
                    <Maths inline text={result.feasibility.marks_reason} />
                  </p>
                ) : (
                  <p>
                    The total of {result.brief.totalMarks} marks was retained.
                  </p>
                )}
                {result.effectiveBrief.difficulty !== result.brief.difficulty && (
                  <p>Difficulty: {result.brief.difficulty} to {result.effectiveBrief.difficulty}.</p>
                )}
                {result.feasibility.specification_adjustments.map(
                  (message, i) => (
                    <p key={i}>
                      <Maths inline text={message} />
                    </p>
                  ),
                )}
                <p className="hint">
                  {result.generationMode === 'similar'
                    ? 'Review the assigned marks or requested refinements alongside the question. Use Refine draft and recheck for further changes.'
                    : 'Recommendation: narrow the selected sub-topics, increase the marks if broader coverage is essential, or revise conflicting specifications, then generate again. Review these AI assessments alongside the question.'}
                </p>
              </div>
            )}
          {busy && (
            <div role="status" className="status">
              <LoaderCircle className="spin" size={18} />
              {busy}
              <small>This may take a few minutes.</small>
            </div>
          )}
          {!d ? (
            <div className="paper empty">
              <h3>A new question, grounded in your course.</h3>
              <p>
                Choose a topic and describe what you need. Your questions and
                worked solutions will appear here.
              </p>
              <div className="steps">
                <span>01 · Retrieve examples</span>
                <span>02 · Generate & check</span>
                <span>03 · Refine & export</span>
              </div>
            </div>
          ) : (
            <>
              <article className="paper">
                <div className="paper-meta">
                  <span>
                    {result.effectiveBrief.questionType} ·{' '}
                    {result.effectiveBrief.difficulty} ·{' '}
                    <Maths inline text={result.effectiveBrief.subtopics
                      .map((id) => topics.find((t) => t.id === id)?.name)
                      .join(' · ')} />
                  </span>
                  <strong>{d.total_marks} marks</strong>
                </div>
                <h3>Question</h3>
                <Maths text={d.question} />
                {d.parts.map((part) => (
                  <div className="question-part" key={part.label}>
                    <strong><Maths inline text={part.label} /></strong>
                    <Maths text={part.prompt} />
                  </div>
                ))}
                {d.options.length > 0 && (
                  <div className="mcq-options">
                    {d.options.map((option) => (
                      <div className="question-part" key={option.label}>
                        <strong>{option.label}.</strong>
                        <Maths text={option.text} />
                      </div>
                    ))}
                  </div>
                )}
                {d.diagrams
                  .filter((x) => x.placement === 'question')
                  .map((x, i) => (
                    <figure key={i}>
                      {x.graph ? (
                        <DesmosGraph diagram={x} />
                      ) : (
                        <div
                          dangerouslySetInnerHTML={{ __html: svgDiagram(x) }}
                        />
                      )}
                      <figcaption>
                        <Maths inline text={x.caption} />
                      </figcaption>
                    </figure>
                  ))}
                <div className="solution-heading">
                  <h3>
                    {solution === 0
                      ? 'Main solution'
                      : `Alternative solution ${solution}`}
                  </h3>
                  <div className="solution-nav">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Previous solution"
                      disabled={solution === 0}
                      onClick={() => setSolution(solution - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <span>
                      {solution + 1} / {d.solutions.length}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Next solution"
                      disabled={solution === d.solutions.length - 1}
                      onClick={() => setSolution(solution + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
                {sol && (
                  <>
                    <p className="method">
                      <Maths inline text={sol.title} />
                    </p>
                    {d.question_type === 'MCQ' && (
                      <p>
                        <strong>Correct answer: {d.correct_option}</strong>
                      </p>
                    )}
                    <Maths text={sol.content} />
                    {d.diagrams
                      .filter((x) => x.placement === 'solution')
                      .map((x, i) => (
                        <figure key={i}>
                          {x.graph ? (
                            <DesmosGraph diagram={x} />
                          ) : (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: svgDiagram(x),
                              }}
                            />
                          )}
                          <figcaption>
                            <Maths inline text={x.caption} />
                          </figcaption>
                        </figure>
                      ))}
                    {d.question_type === 'MCQ' ? (
                      <p className="mcq-scoring">
                        <strong>Scoring:</strong> 2 marks for the correct
                        option; 0 otherwise. No partial credit.
                      </p>
                    ) : (
                      <>
                        <h4>Proposed marking allocation</h4>
                        <table className="marks">
                          <thead>
                            <tr>
                              <th>Part</th>
                              <th>Criterion</th>
                              <th>Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sol.marking.map((m, i) => (
                              <tr key={i}>
                                <td><Maths inline text={m.part} /></td>
                                <td>
                                  <Maths text={m.criterion} />
                                </td>
                                <td>{m.marks}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2}>Total</td>
                              <td>{d.total_marks}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </>
                    )}
                  </>
                )}
              </article>
              <div
                className={`review ${result.review.passed && !manual ? 'passed' : 'attention'}`}
              >
                <strong>
                  {manual
                    ? 'Diagram edited · recheck recommended'
                    : result.review.passed
                      ? 'Review pass completed'
                      : 'Review found issues'}
                </strong>
                <p>
                  <Maths inline text={result.review.summary} />
                </p>
                {result.review.issues.map((x, i) => (
                  <p key={i}>• <Maths inline text={x} /></p>
                ))}
                <details>
                  <summary>Scope, difficulty and calculation checks</summary>
                  <p>
                    <Maths inline text={d.scope_explanation} />
                  </p>
                  <p>
                    <Maths inline text={d.difficulty_explanation} />
                  </p>
                  {result.review.context_summary && (
                    <p>
                      <strong>Context plausibility:</strong>{' '}
                      <Maths inline text={result.review.context_summary} />
                    </p>
                  )}
                  {result.review.preservation_notes && (
                    <p>
                      <strong>Refinement changes:</strong>{' '}
                      <Maths inline text={result.review.preservation_notes} />
                    </p>
                  )}
                  {result.review.non_routine_parts?.map((part, i) => (
                    <p key={i}>
                      <strong>Non-routine task:</strong>{' '}
                      <Maths inline text={part} />
                    </p>
                  ))}
                  {result.review.scope_evidence?.map((item, i) => (
                    <p key={i}>
                      <strong><Maths inline text={item.task} />:</strong>{' '}
                      <Maths inline text={item.evidence} />
                    </p>
                  ))}
                  <p>
                    {result.calculations.length
                      ? `${result.calculations.length} independent review calculation checks completed.`
                      : 'No independent review calculator checks were recorded; inspect the solution manually.'}
                  </p>
                  {result.calculations.map((c, i) => (
                    <pre key={i}>
                      <Maths inline text={c.expression} />
                      {'\n'}= <Maths inline text={c.result} />
                    </pre>
                  ))}
                  <p>
                    Automated review is advisory. Check the question before
                    assessment use.
                  </p>
                </details>
              </div>
              {diagram && !diagram.graph && (
                <details className="editor">
                  <summary>Edit vector diagram</summary>
                  <Choice
                    label="Diagram"
                    value={String(diagramIndex)}
                    items={d.diagrams.map((x, i) => ({
                      id: String(i),
                      name: x.caption,
                    }))}
                    onChange={(v) => {
                      setDiagramIndex(Number(v));
                      setShapeIndex(0);
                    }}
                  />
                  <Choice
                    label="Shape"
                    value={String(shapeIndex)}
                    items={diagram.shapes.map((s, i) => ({
                      id: String(i),
                      name: `${i + 1}. ${s.type}${s.text ? ' · ' + s.text : ''}`,
                    }))}
                    onChange={(v) => setShapeIndex(Number(v))}
                  />
                  {shape &&
                    shape.type !== 'curve' &&
                    shape.type !== 'polyline' && (
                      <div className="shape-fields">
                        {[
                          'x',
                          'y',
                          ...(shape.type === 'text' || shape.type === 'math'
                            ? ['text']
                            : shape.type === 'line' ||
                                shape.type === 'arrow' ||
                                shape.type === 'measurement'
                              ? ['x2', 'y2']
                              : shape.type === 'rect' ||
                                  shape.type === 'ellipse'
                                ? ['width', 'height']
                                : []),
                        ].map((f) => (
                          <label key={f}>
                            {f}
                            <Input
                              type={f === 'text' ? 'text' : 'number'}
                              value={(shape as any)[f]}
                              onChange={(e) => changeShape(f, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      save(
                        svgDiagram(diagram),
                        `${result.effectiveBrief.module}-diagram.svg`,
                        'image/svg+xml',
                      )
                    }
                  >
                    <Download size={16} />
                    Download editable SVG
                  </Button>
                </details>
              )}
            </>
          )}
          <section className="references" id="source-references" ref={sourcePanel} tabIndex={-1} aria-label="Source references">
            <div className="eyebrow">
              SOURCE REFERENCES
            </div>
            {generationMode === 'similar' && (!result || sourcePickerOpen) && <SourceBrowser
              key={browseKey}
              references={sourceKey === browseKey ? refs : []}
              selected={selectedReference?.id || ''}
              onSelect={setSelectedSource}
              onBrowse={browseSources}
              loading={referencesLoading}
              disabled={!!busy || !history || !!configIssues.length}
              loaded={sourceKey === browseKey}
              error={referenceError}
              progress={sourceProgress}
            />}
            {result && <h3>References used by the current draft ({shownRefs.length})</h3>}
            {!result && generationMode === 'new' && (
              <p className="hint">
                Sources are retrieved when you click Generate new question.
              </p>
            )}
            {result?.generationMode === 'similar' ? <p className="hint">
              This draft is based on the selected source question below. Use Browse source questions to choose a source for another question.
            </p> : result && <p className="hint">
              {result.exactExamples} exact sub-topic matches.
              Related examples stay within the selected topic. Source totals
              without step allocations are not treated as detailed marking
              schemes.
            </p>}
            {shownRefs.map((ref) => (
              <details key={ref.id} className="ref">
                <summary>
                  <span>
                    <Maths inline text={ref.label} /> ·{' '}
                    {ref.totalMarks
                      ? `${ref.totalMarks} marks`
                      : ref.parentMarks
                        ? `${ref.parentMarks} marks for parent question; part allocation unstated`
                        : 'Marks unstated'}
                  </span>
                  <small>
                    {ref.difficulty} · {ref.match}
                  </small>
                </summary>
                <div className="source-pages">
                  <p className="hint">
                    Original question crops for <Maths inline text={ref.label} />. Shared instructions
                    are retained where needed; original wording may differ from
                    verified bank corrections. Select an image to view it full
                    size.
                  </p>
                  {ref.screenshots.map((page) => (
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      key={page.page}
                    >
                      <img
                        loading="lazy"
                        src={page.url}
                        alt={`${ref.label}, question crop from page ${page.page}`}
                      />
                      <span className="hint">
                        Question crop · page {page.page}
                      </span>
                    </a>
                  ))}
                </div>
                <h4>Source question</h4>
                <Maths text={ref.question} />
                <h4>Source solution</h4>
                <Maths text={ref.solution} />
                {ref.alternatives.map((s, i) => (
                  <div key={i}>
                    <h4>Alternative {i + 1}</h4>
                    <Maths text={s} />
                  </div>
                ))}
                {ref.images.map((img) => (
                  <img
                    key={img.name}
                    src={img.url}
                    alt={`${ref.label} diagram`}
                  />
                ))}
              </details>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}
