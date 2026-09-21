# MSA Question Studio

Version: 2026-09-21

See the [technical documentation](DOCUMENTATION.md) for the architecture, backend workflow, guardrails, tests and extension options, and the [security review](SECURITY.md) for fixes, verification and the limitations of public access.

For shared hosting, follow [Vercel and Supabase setup](DEPLOYMENT.md). Supabase keeps approved questions, revisions, traces and the source bank across deployments; private Storage holds source PDFs and images. Local SQLite remains available with `STUDIO_STORAGE=local`.

The file-based source-bank and live prompt-editing instructions below describe local operation. In Supabase mode the runtime source bank comes from PostgreSQL; on Vercel, prompt-file edits require a new deployment. `pnpm cloud seed` adds new source IDs without overwriting existing cloud records.

Generate syllabus-grounded questions from verified EXAM/MST examples, review solutions, refine questions and export editable Word documents. EM1 is included; the import workflow supports additional modules such as EM2.

## Preview the inputs and outputs

You can explore these artefacts without configuring an API key or running the app:

- **[Generated Word samples](examples/generated-questions/)** — nine exports produced by the app, covering MCQ and Structured questions at Basic and Challenging levels. Open them in Word to see the exported question and solution presentation. For a starting point, try the [Matrices and Determinants MCQ](<examples/generated-questions/EM1_MCQ_Matrices and Determinants.docx>) or the [Basic definite-integral question](<examples/generated-questions/EM1_Structured_Definite Integrals and Area Under a Curve_Basic.docx>). Files ending in `_1` are additional samples and have been retained separately.
- **[EM1 question-bank workbook](examples/question-bank/EM1_question_bank.xlsx)** — the earlier Excel question bank, retained as a convenient preview of the source material and its organization.

These are illustrative snapshots, not automated test fixtures or a guarantee of the latest output. The workbook may differ from the current bank. The app reads [data/bank.json](data/bank.json), [data/modules.json](data/modules.json) and [data/reference-crops.json](data/reference-crops.json); changing an example document or the workbook does not update the app. Use the import/update process below for data changes. GitHub may require downloading Office files to view them.

## Run in VS Code

Open **this `msa-question-studio` folder** containing `package.json`. The parent LADP folder, Codex and the old hosted site are not required. Install Node.js 22.13+ (Node 24 LTS recommended), then use the VS Code terminal:

```powershell
npm install -g pnpm@10.32.1
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Edit `.env` with one provider's settings. If it already exists, edit it instead of overwriting it. Then:

```powershell
pnpm dev
```

Open the URL printed in the terminal, normally **http://127.0.0.1:3000**. Keep the terminal running; Ctrl+C stops it. If PowerShell blocks `pnpm.ps1`, use `pnpm.cmd`. On macOS/Linux use `cp .env.example .env`. VS Code tasks are under **Terminal → Run Task**.

For the compiled app:

```powershell
pnpm build
pnpm start
```

Restart after editing `.env`. Committed bank changes apply to the next reference retrieval; reload the page after adding modules or taxonomy entries. Installation/build, provider generation and Desmos require internet access to their respective services.

For new questions, source retrieval starts only after Generate is clicked. Configuration changes and typing do not trigger source searches. In similar mode, Browse source questions scrolls to the main Source references section. Use the searchable list and larger preview there to select a source and generate. Temporary failures retry automatically up to three attempts, each with a 20-second timeout; changing filters cancels pending browsing. Sources depend only on module, question type, topic and difficulty. Cloud source-bank reads use one database round trip and a one-minute cache.

## Configure a provider

`AI_PROVIDER` selects the active group. Server credentials are used automatically; no UI key entry is required. There are no browser key/provider controls. Missing configuration produces a server-configuration error; edit .env and restart.

| Provider | Required settings | Model setting |
| --- | --- | --- |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY` | `OPENAI_MODEL`, default `gpt-5.6-sol` |
| Azure | `AI_PROVIDER=azure`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_CHAT_DEPLOYMENT_NAME` | Actual Azure deployment name |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL`, default `claude-sonnet-5` |

Default model names preserve the previous configuration; choose models available to your account with structured output, vision and tool support. Requests use high reasoning effort. Azure and standard OpenAI keys are not interchangeable. Paste the Azure endpoint as a plain HTTPS URL without Markdown syntax. Azure uses `/openai/v1/responses`; API-version and embedding deployment settings are not used.

Set `DESMOS_API_KEY` for graphs and graph images in Word. It is a browser API key and is visible to the browser. Provider keys remain server-side. Never commit `.env` or put secrets in `VITE_` / `NEXT_PUBLIC_` variables.

The app opens without a separate username/password prompt. Vercel deployment protection controls access to the hosted site; local commands bind to localhost. Everyone who can reach the app shares its repository, source bank and generation capacity. Serve shared installations over HTTPS. DOCUMENTATION.md explains the access model.

## Generate, refine and export

1. Select an active module and main topic, then Structured or MCQ.
2. Structured: choose sub-topics (All means within this topic), difficulty and marks. Basic is fixed at 10 marks. Challenging defaults to 15 marks, editable afterward. Challenging questions can include a non-routine task that rewards interpretation and method selection rather than lengthy calculation. The optional MSA formula-sheet setting lets students consult only the formulas mapped to the selected syllabus scope. Creative context and multiple parts are optional. Choose 2–6 parts or let the model decide.
3. Add methods, context, diagram, rounding or part-mark requirements. Related outputs may share a part; unrelated problems should be separate.
4. Generate. MCQ mode produces three conceptual candidates with minimal calculation, four options each, one correct answer and fixed 2-or-0 scoring. Page through them with the arrows.
5. Review source references, solutions and proposed marks. Solution arrows expose alternative methods.
6. Describe changes in the refinement field below the generated heading and apply/recheck. Unaffected structure, given formulas and numbers are retained; dependent corrections are rechecked. Open **Refinement history** to compare or restore versions. Restoring keeps later refinements, and approval saves the history with the question.
7. Export with **Export Word**. Word uses Times New Roman 11 pt, editable equations and black 1.5 pt grouped vector diagrams. Measurement arrows have two heads. Desmos graphs export as images. Filenames are `module_type_topic_difficulty.docx` for Structured and `module_type_topic.docx` for MCQ.

Choose **New question from the brief** or **Similar question from a source** before generating. Similar mode uses only module, question type, topic and difficulty to filter the source list. It has no sub-topic or total-mark inputs. Browse and view compatible source questions, then select the exact base. The first generation retains its source scope, difficulty and recorded marks, including Basic and fractional marks; AI assigns a fair total when marks are absent, and MCQs remain 2 marks. Request changes to marks, difficulty or structure afterward through Refine draft and recheck; later refinements preserve those revised settings. Optional **Change numbers / formulas** and **Change context** preferences guide the variation; leave both unchecked for AI to decide. The central mathematical method is retained and all dependent answers are recomputed. Creative-context, non-routine, formula-sheet and multiple-part controls are shown only for new Structured questions. Additional specifications are also hidden in similar mode: generate the variation first, then use Refine draft and recheck for changes. Similar questions follow the selected source structure; hidden or stale part settings do not constrain generation, refinement or repository approval. It produces a separate draft. **Refine draft and recheck** changes the displayed draft instead.

**Drafts this visit** are temporary. Choose **Approve for repository** to keep a question across sessions. In **Approved repository**, open saved questions to view/refine them or delete them. Refining does not change the approved copy until **Approve replacement** is selected. Concurrent changes are detected: reopen the latest revision if another session has changed it. Old browser session drafts are recovered once for explicit approval; new drafts are no longer persisted automatically.

The **Define sections** bar appears near the top of both repository and assembly views. Name or add sections there before selecting questions. Repository cards show which saved worksheets contain each question, including section and selected revision; unsaved assemblies and downloaded files are not tracked. In **Paper assembly**, add approved questions to named sections and drag their card grips to reorder them or move them between sections. Cards show the main topic and difficulty. Position and section menus support keyboard and touch. Set the title, optional Name/Class fields, and instructions. **Save worksheet** keeps this configuration in the app database across sessions; reopen it from **Saved worksheets** to edit or export. **Save changes** updates the opened worksheet; **Save as new worksheet** keeps a separate copy. Empty sections can be saved while planning but must be filled or removed before export. Unsaved edits remain only in the current page.

Every **student Word** export contains questions followed by an answer key. **Lecturer Word** places each question immediately before its main solution, alternative solutions and marking allocations, with an answer key at the end. Both include the AI disclaimer. Older questions without a concise answer key use the main solution for their key. Saved worksheets keep approved question IDs and revisions; if a question is replaced or deleted later, use **Refresh selected questions** to accept current approved revisions and remove deleted questions, then save again. Export rejects outdated selections. Deleting a saved worksheet does not delete its repository questions.

Word exports preserve solid fills in editable rectangles, ellipses, polylines and curves. Every export displays **“Question generated by AI. Review before assessment use.”** below its title.

Review before assessment use. Automated checks do not guarantee correctness. Structured configuration adjustments explain omitted topics or changed marks; exact marks take priority. Failure messages begin **Question could not be generated.** Temporary service failures may retry once; unresolved material scope/math/format failures are not silently accepted.

Creative scenarios are checked for plausible dimensions, configurations, scale and units; the app also reminds staff to check validity and reasonableness themselves. These are AI plausibility checks, not external fact verification.

**Shared terminology rules** lets staff explicitly save, edit and remove module wording preferences for the whole team. Ordinary refinements are not silently learned. Saved rules are used by planning, authoring and review, with deterministic checks for prohibited phrases. Rules cannot add assessed syllabus content. EM1 wording avoids locus and antiderivative; similar-triangle derivations are excluded, so any needed contextual relationship must be given.

The original four-page **MSA Formula Sheet.pdf** is retained in `data/`. `data/formula-catalog.json` contains 25 visually checked EM1 entries/groups, with PDF pages, domain conditions and mappings to the current notes. Only mapped entries for the selected sub-topics (or explicitly mapped prerequisites) reach the model. Material for other modules, including transforms, statistics, differential equations and advanced integration, stays outside EM1 generation. The full source is viewable through `/api/formula-sheet`. Formula availability never expands assessed scope. Updating the PDF requires verifying and updating the catalogue and source hash, then rebuilding; adding a module requires its own syllabus mapping. EM2 can reuse this same PDF without reimporting it: supply its syllabus/notes and map the permitted formulas before enabling formula-assisted EM2 generation.

## Edit the generation prompts

[PROMPTS.md](PROMPTS.md) is the independent, dated configuration document read by the server. Edit its text blocks to change planning, generation, review, repair and the user-message instructions. Keep the section IDs and fences intact and update its version date. Changes apply to the next generated question without rebuilding. User brief controls, specifications and refinements remain dynamic inputs; JSON schemas and deterministic checks remain in code. Module-specific text and dates live in `prompts/EM1.md`, `prompts/EM2.md`, and so on. Each override declares its module and date; unspecified blocks use the shared baseline. Responses and traces carry a module-qualified identity and a combined content hash. Include both `PROMPTS.md` and `prompts/` when deploying the app.

The app release date is displayed in the header and maintained in `lib/version.ts`, this README and `DOCUMENTATION.md`. The prompt date is independent and should change whenever prompts change.

## Local database and trace history

SQLite replaces Langfuse and browser question persistence. No external database service or account is required. This replaces the Langfuse integration, but does not stop or uninstall an existing Langfuse Docker stack. The Node server creates its database automatically at `%LOCALAPPDATA%/MSA Question Studio/studio.sqlite` on Windows, or `~/.local/share/MSA Question Studio/studio.sqlite` elsewhere. Set `STUDIO_DB_PATH` in `.env` to use another local persistent path, then restart. Keep the live database outside OneDrive and network shares. SQLite is suited to local application storage; all database access here stays on the app server ([SQLite guidance](https://www.sqlite.org/whentouse.html)).

The database stores approved questions, immutable approved revisions, approval/deletion events, import job status, generation/refinement traces, and individual model calls. **Activity** lets you inspect and download traces. Activity/API downloads expose only metadata and token usage, including for historical records. Content capture is off by default. Explicit `AUDIT_CAPTURE_CONTENT=true` enables redacted diagnostic question data in the server database; internal instruction fields are excluded even then. Existing explicitly enabled settings are unchanged. Existing `LANGFUSE_*` settings are ignored; no Langfuse telemetry is sent. Provider calls for question generation and PDF extraction continue to use the configured AI service.

All users of the same app installation share its repository and trace metadata. This prototype currently remains public by owner choice; there is no app password or staff sign-in. Separate machines do not automatically share a database. This is intended for one Node server with a persistent local disk, not stateless/serverless hosting. To move existing data, stop the app and copy its database together with any remaining `-wal`/`-shm` files before changing `STUDIO_DB_PATH`. Back up the source-bank `data/`, `public/source-questions/`, and `imports/` folders too. The SQLite file is not encrypted by the app; use operating-system access controls/disk encryption where needed. Deleted questions disappear from the repository and cannot be assembled; prior revisions are retained for traceability.

## Import papers or add a module

**Import sources** provides a browser upload/review workflow for existing modules: supply an MST/Exam question PDF and its worked-solution PDF, extract, compare every record with the originals, save review notes, and explicitly approve the verified sources. The screen resumes saved review work across visits and exposes processing errors. Transient provider failures retry once. Failed extraction can be retried from the stored PDFs without uploading again. Committed questions become available to the next reference retrieval without restarting. The CLI below remains available for adding new modules, notes/taxonomies, or correcting extraction coverage with additional records. Do not run a CLI commit concurrently with a browser import commit.

Imports use local administrative files. Extraction sends the selected PDFs to the provider in `.env` and incurs provider charges. Use dated EXAM/MST pairs, not revision handouts. Install Python 3.11+ and:

```powershell
python -m pip install -r requirements-import.txt
```

If necessary, set `PYTHON` in `.env` to the executable containing those packages. Create this folder and copy `imports/templates/manifest.json` into it:

```text
imports/inbox/EM2-2026-batch1/
  manifest.json
  notes.pdf
  exam.pdf
  solutions.pdf
```

Example manifest:

```json
{
  "batch": "EM2-2026-batch1",
  "module": {"id": "EM2", "name": "Engineering Mathematics II", "notation": "Follow the supplied EM2 notes and notation."},
  "notes": "notes.pdf",
  "papers": [{"id": "EM2-EXAM-2526-S2", "kind": "EXAM", "academic_year": "2025/2026", "semester": "2", "question_pdf": "exam.pdf", "solution_pdf": "solutions.pdf"}]
}
```

Paths are relative to the manifest. Add paper objects for additional pairs; IDs must be unique. To append EM1 samples, use its module metadata from `data/modules.json` and omit notes to reuse its taxonomy. A new module needs notes or a `taxonomy` path to JSON with a `topics` array matching DOCUMENTATION.md. Existing-module notes can propose taxonomy additions; review changes to existing IDs carefully.

```powershell
pnpm bank extract imports/inbox/EM2-2026-batch1/manifest.json
```

Extraction creates `imports/staging/EM2-2026-batch1/` with rendered pages, `manifest.json`, `taxonomy.json` and `review.json`. It does **not** change the live bank. Pairs are limited to 40 pages total. Failed extraction leaves staged evidence; correct the cause and use a new batch ID, or deliberately remove the failed staging folder before retrying.

### Verify every paper and solution set

Open original PDFs/rendered pages beside the staged JSON:

- Compare `expected_source_questions` with every printed question/part. This list is AI-generated, not proof of completeness. Correct it and add any missing records.
- Check values, equations, options, instructions, marks, all solutions and marking JSON. JSON doubles LaTeX backslashes, e.g. `"$\\frac{1}{2}$"`.
- Keep unrelated parts separate; retain shared stems and labels for linked parts.
- Check taxonomy tags, difficulty and source metadata.
- Check `question_crops`: normalized `[left, top, right, bottom]` coordinates in 0–1 page units. Retain needed shared context. Check solution pages and `has_diagram`.
- Resolve every record's `issues`, set its `verified` to true and add `reviewer_notes`.
- Verify each entire paper/solution pair, set its `verified` to true and add its `reviewer_notes`.
- Review taxonomy, set `taxonomy_verified` to true and fill `taxonomy_reviewer_notes`.

Do not change flags without checking. Stop the server, promote and restart:

```powershell
pnpm bank commit EM2-2026-batch1
pnpm bank validate
pnpm dev
```

Promotion appends records, creates crops/image data, updates modules and backs up old JSON. New module/topic choices appear after restart; no UI edit is needed. Duplicate IDs are rejected. Run only one import at a time.

### Deprecation and corrections

```powershell
pnpm bank status EM2-1.1 Deprecated
pnpm bank status EM2-1.1 Active
pnpm bank status EM2-EXAM-2526-S2-001 Deprecated
```

Use actual IDs. Deprecated records remain for history but leave retrieval. Restart/rebuild afterward. Correct existing questions directly in `data/bank.json` using a reviewed Git diff and preserve IDs; do not duplicate papers to correct them. To undo an import, stop the server and restore all affected JSON files together from the printed `imports/backups/` folder or Git, then rebuild. Remove unused crop images only after checking the restored crop manifest.

## Share on GitHub

This folder is the active repository. Commit application code, required components, data, source-question crops, scripts/tests, docs, package/lock files and empty-key `.env.example`. Do not commit `.env`, dependencies, builds, import inbox/staging/backups or test-output; `.gitignore` covers them. Bank text and source crops are tracked because the app needs them.

Include `examples/` when sharing the repository so readers can preview the workbook and Word exports before running the app. These files are documentation assets and are not required at runtime.

Review and commit with VS Code Source Control. Create an empty GitHub repository, then:

```powershell
git remote add origin https://github.com/YOUR-ACCOUNT/msa-question-studio.git
git push -u origin main
```

If origin exists, inspect `git remote -v` and use `git remote set-url origin ...` for the intended repository. No GitHub repository has been created or pushed automatically. Collaborators clone and follow the setup instructions with their own `.env`.

## Layout and maintenance

```text
app/                     UI and server routes
components/ui/           Only components used by the app
lib/                     Retrieval, generation, providers, security, export
data/                    Bank, module registry, screenshot manifest
examples/                Sample Word exports and historical Excel bank preview
public/source-questions/ Required source crops
imports/                 Templates and ignored local import folders
scripts/                 Tests and PDF import tools
.env.example             Empty configuration template
README.md                User instructions
DOCUMENTATION.md         Technical workflow, guardrails and extensions
VALIDATION.md            Migration checks and limits
```

Before sharing changes run `pnpm typecheck`, `pnpm test`, `pnpm bank validate` and `pnpm build`. Tests simulate providers and an isolated EM2 import without API charges. The import fixture needs Python dependencies.

Legacy course files, full-page reference copies, conversion scripts and the old app were retired outside this repository and are not required. Bulk deletion was blocked by the execution environment; archived/remnant folders in the parent workspace may still need manual deletion. Do not include them in GitHub. This migration leaves the previous hosted site unchanged.
