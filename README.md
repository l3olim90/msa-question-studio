# EM1 Question Studio

A web interface and server-side retrieval/generation workflow built from the verified EM1 question bank. Difficulty labels are Basic, Intermediate and Challenging.

## Use

Select module, topic, sub-topic and difficulty, enter any additional specifications and your OpenAI API key, then generate. The fixed model is `gpt-5.6-sol` with `reasoning.effort: high`. API access and billing depend on your API account. The key is held only in React memory and sent to this app's backend for each generation; it is not written to local storage, cookies, logs or a database. Closing/reloading the page clears it. Responses requests use `store: false`; OpenAI's API data policies still apply.

Preview the question and solutions, navigate alternative methods, inspect the retrieved references and proposed marks, then request edits. Edits reuse the draft's original brief, so changing the dropdowns does not silently change an existing draft. Each revision receives a fresh review. A failed automated review stays visible and does not masquerade as a passed check.

Diagrams consist only of SVG lines, arrows, rectangles, ellipses, polylines and labels. Basic positions and labels can be edited in the app; download the SVG for full editing in a vector editor. Word export includes native Office Math (OMML) equations and SVG diagrams with PNG compatibility fallbacks. This is editable Word equation content, not MathType objects; conversion to MathType depends on the user's installed MathType tooling.

## Pipeline

1. Validate the active module/topic/sub-topic against the taxonomy.
2. Exclude deprecated taxonomy IDs, inactive questions and records ineligible for retrieval. All additional tags must also be active.
3. Rank eligible examples by exact sub-topic, difficulty and specification keywords; choose up to four distinct parent questions, using related examples within the selected topic if necessary. The UI exposes the exact-match count. This is a deterministic metadata/lexical RAG baseline, without embeddings or a vector database; 128 records do not require external indexing.
4. Attach the selected notes excerpt, active same-topic prerequisite headings, full questions, solutions, alternatives and marking JSON. Include all associated source diagrams as image inputs, labelled with their source IDs.
5. Generate strict structured JSON. The model can call a bounded mathjs calculator for arithmetic, complex numbers, determinants, inverses and derivatives. No arbitrary code execution is allowed.
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

Live OpenAI generation has not been exercised because no API key was provided. The first key-backed generation is still an integration check. Browser interaction testing was not requested. Optional WebMCP brief configuration is feature-detected; no supported WebMCP validation context was available, so it is not claimed as tested.

## Official API references

- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)
