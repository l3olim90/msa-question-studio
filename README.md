# MSA Question Studio

See the [technical documentation](DOCUMENTATION.md) for the architecture, backend workflow, guardrails, tests and extension options.

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

Restart after editing `.env`. Restart development or rebuild production after bank changes. Installation/build, provider generation and Desmos require internet access to their respective services.

## Configure a provider

`AI_PROVIDER` selects the active group. Server credentials are used automatically; no UI key entry is required. There are no browser key/provider controls. Missing configuration produces a server-configuration error; edit .env and restart.

| Provider | Required settings | Model setting |
| --- | --- | --- |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY` | `OPENAI_MODEL`, default `gpt-5.6-sol` |
| Azure | `AI_PROVIDER=azure`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_CHAT_DEPLOYMENT_NAME` | Actual Azure deployment name |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL`, default `claude-sonnet-5` |

Default model names preserve the previous configuration; choose models available to your account with structured output, vision and tool support. Requests use high reasoning effort. Azure and standard OpenAI keys are not interchangeable. Paste the Azure endpoint as a plain HTTPS URL without Markdown syntax. Azure uses `/openai/v1/responses`; API-version and embedding deployment settings are not used.

Set `DESMOS_API_KEY` for graphs and graph images in Word. It is a browser API key and is visible to the browser. Provider keys remain server-side. Never commit `.env` or put secrets in `VITE_` / `NEXT_PUBLIC_` variables.

For shared use, set `APP_USERNAME` and a strong `APP_PASSWORD` and serve through an HTTPS reverse proxy. Default commands bind to localhost. Do not expose an unauthenticated server or use plain HTTP over a network. DOCUMENTATION.md explains the security limits.

## Generate, refine and export

1. Select an active module and main topic, then Structured or MCQ.
2. Structured: choose sub-topics (All means within this topic), difficulty and marks. Defaults are Basic / 10 marks. Challenging sets 15 marks, editable afterward. Creative context and multiple parts are optional. Choose 2–6 parts or let the model decide.
3. Add methods, context, diagram, rounding or part-mark requirements. Related outputs may share a part; unrelated problems should be separate.
4. Generate. MCQ mode produces three conceptual candidates, four options each, one correct answer and fixed 2-or-0 scoring. Page through them with the arrows.
5. Review source references, solutions and proposed marks. Solution arrows expose alternative methods.
6. Describe changes in the refinement field below the generated heading and apply/recheck.
7. Export with **Export Word**. Word uses Times New Roman 11 pt, editable equations and black 1.5 pt grouped vector diagrams. Measurement arrows have two heads. Desmos graphs export as images. Filenames are `module_type_topic_difficulty.docx` for Structured and `module_type_topic.docx` for MCQ.

Results are in memory: export before refreshing or closing. Review before assessment use. Automated checks do not guarantee correctness. Structured configuration adjustments explain omitted topics or changed marks; exact marks take priority. Failure messages begin **Question could not be generated.** Temporary service failures may retry once; unresolved material scope/math/format failures are not silently accepted.

## Import papers or add a module

Imports are local administrative commands. Extraction sends the selected PDFs to the provider in `.env` and incurs provider charges. Use dated EXAM/MST pairs, not revision handouts. Install Python 3.11+ and:

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
