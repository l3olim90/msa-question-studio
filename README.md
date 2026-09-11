# MSA Question Studio

A web interface and server-side retrieval/generation workflow built from the verified EM1 question bank. Difficulty labels are Basic, Intermediate and Challenging.

## Use

Select module, topic, one or more sub-topics and difficulty, enter a whole-number total of at least 1 mark, enter any additional specifications, select your provider and enter its API key, then generate. OpenAI defaults to `gpt-5.6-sol` with High reasoning. Anthropic defaults to `claude-sonnet-5` with `output_config.effort: high` and adaptive thinking. Azure uses your deployment name with High reasoning; that deployment must support Responses, images, structured outputs and tools. API access and billing depend on the selected provider account. Azure requires its own resource key, HTTPS resource endpoint and deployment name. Keys are not interchangeable between providers. The key is held only in React memory and sent to this app's backend for each generation; it is not written to local storage, cookies, logs or a database. Closing/reloading the page clears it. OpenAI and Azure Responses requests use `store: false`. Provider data policies still apply. Switching providers clears the key field.

The sub-topic checklist includes All, selecting every active sub-topic within the current topic. Changing the topic resets the selection. A planning pass prioritises the exact requested marks, selecting a relevant nonempty subset when the full selection is too broad or conflicts with specifications. Every omitted sub-topic gets a reason. Only when exact marks are infeasible may the planner choose the nearest feasible integer total; every proposed marks change receives a second reconsideration pass. An error-style alert accompanies the generated question, showing omitted topics, changed specifications, requested versus actual marks, and why exact marks were not followed. Original and effective briefs are kept separately; edits reconsider the original request. These are AI assessments, not a mathematical guarantee of optimality.

Preview the question and solutions, navigate alternative methods, inspect the retrieved references and proposed marks, then request edits. Edits reuse the draft's original brief, so changing the dropdowns does not silently change an existing draft. Each revision receives a fresh review. A failed automated review stays visible and does not masquerade as a passed check.

Diagrams consist only of SVG lines, arrows, rectangles, ellipses, polylines and labels. Basic positions and labels can be edited in the app; download the SVG for full editing in a vector editor. Word export includes native Office Math (OMML) equations and native grouped DrawingML shapes, with editable labels and cubic curve points. In desktop Word, select the diagram and use Shape Format > Group > Ungroup. This is editable Word equation content, not MathType objects; conversion to MathType depends on the user's installed MathType tooling.

## Pipeline

1. Validate the active module/topic/sub-topic against the taxonomy.
2. Exclude deprecated taxonomy IDs, inactive questions and records ineligible for retrieval. All additional tags must also be active.
3. Rank eligible examples by exact sub-topic, difficulty and specification keywords; cover each selected sub-topic with a matching example where available, then fill a four-example baseline with distinct parent questions. Larger selections can retrieve more examples; related examples remain within the selected topic. The UI exposes the exact-match count. This is a deterministic metadata/lexical RAG baseline, without embeddings or a vector database; 128 records do not require external indexing.
4. Attach all selected notes excerpts, active same-topic prerequisite headings, full questions, solutions, alternatives and marking JSON. Include all associated source diagrams as image inputs, labelled with their source IDs.
5. Plan the closest feasible configuration with exact marks as the first priority, then generate strict structured JSON. The model can call a bounded mathjs calculator for arithmetic, complex numbers, determinants, inverses and derivatives. No arbitrary code execution is allowed. After eight tool rounds, 24 attempted calculations, or repeated requests, a final tool-free pass completes the draft with the original source context and calculator results. Failed calculations remain explicitly labelled in the log.
6. Validate schema, active syllabus IDs, every marking total, and LaTeX parsing. Independently ask the model to review scope, mathematics, notation, diagram geometry and difficulty. Show the review and calculator log. These checks reduce errors; they are not a proof of mathematical correctness or a replacement for educator review.
7. Export question, question diagrams, main solution and alternatives with proposed marking allocations. Include concise reference labels at the end.

Unknown source allocations are not filled with fabricated source marks. The LLM proposes new marking allocations, explicitly labelled as proposals. Examples alone are not the syllabus boundary: the supplied EM1 notes are included as an additional constraint. The notes excerpts are extracted by section page ranges and can overlap neighbouring sections; the selected sub-topic remains the prompt's explicit scope.

## Data and maintenance

`data/bank.json` is an ingested snapshot of `../outputs/em1_question_bank/*.csv`, the diagram folder and `../EM1 Notes - ver17Mar26.pdf`. It includes the four user-approved revisions. `scripts/ingest.py` regenerates it after bank updates (requires Python and pypdf). Rebuild and deploy after ingestion. Source content is bundled server-side; the client receives only the taxonomy and selected reference records.

The current interface deliberately supports only EM1. Adding modules requires importing their taxonomy and bank, then extending the module schema and selector. Stable module/topic IDs and lifecycle fields are already present in the source bank.

## Development

Use Node 22.13+ and pnpm. Run `pnpm install`, `pnpm dev` and `pnpm build`. On Windows ARM, the current workerd dependency requires an x64 Node runtime under Windows emulation. This checkout was tested that way. Do not copy runtime binaries into the published source.

Backend code: `lib/retrieval.ts`, `lib/generation.ts`, `lib/calculator.ts`. Output contract: `lib/schema.ts`. Word conversion: `lib/word.ts`. UI: `app/workspace.tsx`.

## Validation

TypeScript checks and production build passed. Tests cover active scope filtering, retrieval, calculator restrictions, marking totals, SVG escaping/structure, native Word equation XML and mocked generation with a calculator call. A Word export was opened in Microsoft Word, its native equation objects counted, exported to PDF and visually inspected. The packaged LibreOffice renderer was unavailable, so Microsoft Word was used for that check.

Live generation has not been exercised. Provider routing, Anthropic image/tool continuity and High effort, and Azure endpoint restrictions and authentication were tested with mock credentials. No pasted user key was used. The first key-backed generation is still an integration check. Browser interaction testing was not requested. Optional WebMCP brief configuration is feature-detected; no supported WebMCP validation context was available, so it is not claimed as tested.

## Official API references

- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)


Azure course configurations: enter the resource endpoint and chat deployment name. All Azure requests use Responses v1, supporting High reasoning with function tools; dated API versions from older clients are ignored. Embedding deployment settings are not needed for the current metadata/lexical retriever. All providers use manual redirects and reject 3xx responses without forwarding credentials. Regression tests cover Azure Responses routing with legacy settings and Claude finalization after tool-budget exhaustion or repeated failed calculations.

Alpha-feedback validation: tests cover empty/duplicate/cross-topic selections, all active sub-topics, integer marks including 1, exact-total enforcement, multi-selection generation, and automatic scope reduction, justified mark changes, and a reconsideration restoring exact marks. Provider responses are mocked.


## Question formats and alpha refinements

The studio header uses MSA branding while the active module remains EM1. A session-independent light/dark preference is stored locally; credentials are still held only in memory. Choose Structured or MCQ. Structured supports optional creative context, exactly 2-26 individually answerable parts, difficulty and integer marks. MCQ is conceptual, uses four options with one correct answer, and is always Intermediate or above with a single 2-or-0 award. MCQ controls hide difficulty, marks and multiple parts; server normalization also enforces the fixed settings.

Generated parts and options are separate structured fields rendered in both preview and Word. Prompts and independent review require source/notes terminology, in-module methods only, one answer target per part, misconception-based MCQ distractors and source-calibrated Basic difficulty. A same-topic Basic written example is included when available. Scope or format review failures trigger one repair and review; unresolved failures withhold the draft. Automated checks do not guarantee every model judgement is correct.

Reference cards show available row marks or explicitly labelled parent totals when row allocations are unstated. `scripts/render_references.py` renders all 28 original question-paper pages, linked from every bank record. Screenshots preserve neighbouring questions and original errata; they are display references, while verified source text and relevant diagrams ground the model. Source marking JSON remains in the retrieval prompt but is removed from reference-card display.

Refinement is directly below the draft heading. Export Word is prominent and exports Times New Roman 11 pt, including headings and OMML runs. MCQ options and all-or-nothing scoring are exported without step-mark distribution. Native Word checks confirmed Times New Roman 11 pt and editable equation objects for MCQ and Structured fixtures; PDFs rendered by Word were visually inspected because LibreOffice is unavailable. Regression tests use mock provider responses, including scope repair and rejection, MCQ normalization, exact part counts and source assets. Live provider generation and browser interaction have not been tested in this update.


## Main-topic MCQ candidates

MCQ mode hides sub-topic selection. The server expands the selected main topic to its active sub-topic pool, ignoring stale hidden selections. Each new generation returns three candidates; each chooses a suitable subset and receives its own source retrieval, calculations and review. Candidates are generated sequentially with earlier questions supplied to discourage repeated concepts; exact repeats or failed overall reviews receive one replacement attempt. A set is returned only when all three pass these checks. This requires more provider calls than generating one question.

Previous/Next and numbered navigation switch the question, solution, references and adjustment information together. Refinement and Word export operate on the currently displayed candidate; editing one preserves the others. Automatic choice from the MCQ topic pool is not displayed as an omitted-user-selection error. Structured question controls and behaviour are unchanged. The empty-state copy and header icon are subject-neutral.


## Function graphs

Function graphs now use bounded mathjs evaluation of explicit y=f(x) expressions and emit cubic Bezier SVG paths, rather than polylines. Graph metadata includes numeric bounds, domains, axis labels and optional labelled points. The renderer fixes the layout to no grid and one arrowhead at the positive end of each axis, includes the origin, and separates discontinuities instead of connecting across asymptotes. Non-graph diagrams retain the existing editable shape system. The generated SVG is used by the preview and SVG download; Word export uses equivalent native grouped shapes; refine can change a function/domain, while external vector editors can edit the cubic control points.

Community Desmos MCP implementations were found, but the user selected editable SVG rendering without a separate Desmos key/service. No Desmos integration or Desmos rendering is claimed. Tests cover cubic path output, quadratic interpolation accuracy, arrow directions, labels, rejected expressions and asymptote separation.

Native grouped Word export was opened in desktop Microsoft Word, ungrouped into ten individual shapes, recoloured and relabelled, saved and reopened successfully. Word PDF rendering was visually checked. Curve geometry uses native cubic Bezier nodes; no image conversion or SVG editor is required.

MCQ results never show the configuration-adjustment error panel. Hidden Structured part controls are omitted from MCQ model briefs; format enforcement is not reported as a configuration conflict. Structured adjustment explanations and actual request failures retain their existing handling.

MCQ review uses the same normalized authoring brief as generation, distinguishes the main-topic pool from chosen coverage, and does not treat false in-syllabus distractors as scope violations. A scope/format failure after repair triggers the existing bounded candidate retry; provider errors still propagate. Exhausted review reports its concrete issues. Mock regression exercises failed repair followed by a successful replacement candidate; live provider reproduction was not performed.

Reference images use question-specific original-PDF crops for every bank row, preserving shared stems for independently indexed parts. Rebuild with scripts/crop_references.py; data/reference-crops.json maps each row to its crop. MCQ creative context is hidden and normalized off. Word filenames follow module_type_topic[_difficulty].docx, with difficulty only for Structured.

Desmos API preview: function graphs load the official v1.11 browser calculator using the DESMOS_API_KEY runtime setting. The browser necessarily receives this browser-API key. Preview uses no grid, positive-axis arrows, labels, and pan/zoom. Word export captures a high-resolution PNG from Desmos at the original bounds; other diagrams retain native grouped shapes. Cubic expressions support y= and f(x)= prefixes and Unicode powers. The browser integration was checked against official API documentation; automated checks cover expression normalization and graph picture packaging, not a live Desmos browser session.

Generation safely classifies non-JSON/HTML responses and makes at most one automatic fresh request for temporary transport/provider failures using the identical serialized brief and edit context. Authentication and ordinary validation failures are not retried. Exhausted generation failures have the bold heading Question could not be generated. Structured questions allow 2–6 parts, default 2, enforced in the UI and schema.

Desmos shaded areas use graph.regions with lower/upper functions and an x interval. They render as bounded inequalities in preview and Word screenshots. Numeric checks reject inverted, empty or invalid regions. Requested student-facing shading is checked directly and triggers the existing repair pass if absent. Authoring/review instructions align explicit area tasks and printed part marks with their rubrics. These checks reduce omissions but do not guarantee all model generations pass.
