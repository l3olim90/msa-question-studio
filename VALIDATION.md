# Migration validation

## Team feedback and shared formula sheet: 21 September 2026

Implemented conceptual 2-mark MCQs, fixed 10-mark Basic Structured questions, optional Challenging non-routine tasks, grounded scope/context/preservation review, explicitly saved module terminology rules, refinement comparison/restoration, selected-source browsing, saved worksheet membership and prominent section controls. New-question source retrieval runs on Generate; similar-source browsing is an explicit action. Each generated result retains the formula-sheet identity, applied wording rules and review evidence.

Visually inspected all four pages of the supplied school formula sheet and mapped 25 EM1 formula groups against the current notes, including conditions and page provenance. The original PDF is shared across modules; EM2 needs its own syllabus mapping, not another copy of the PDF. Hash verification rejects an unreviewed replacement sheet. Automated checks cover catalogue math rendering and filtering out other modules' methods.

`pnpm typecheck`, the full `pnpm test` suite, `pnpm build`, `pnpm build:vercel`, focused lint of the new/supporting feature files and `git diff --check` passed. The packaged Vercel function served the formula PDF with HTTP 200 and the exact source hash from its own function directory. Regressions cover legacy mark preservation, source selection beyond the six-example shortlist, refinement restore/persistence and candidate isolation, terminology conflicts, saved worksheet membership, formula scope, and repair when review flags or deterministic terminology checks fail.

Live Azure checks passed for a 15-mark Challenging related-rates question with a plausible tank context, formula availability and a non-routine interpretation task, followed by a surgical refinement of part (b). Independent comparison confirmed the stem, part (a), numerical givens, solution mathematics, diagrams and marks remained unchanged; dependent answer/solution wording was updated. A separate 2-mark matrix MCQ assessed dimensions and conformability without numerical matrix calculation. These are individual provider samples, not exhaustive mathematical or topic validation.

Production HTTP checks used an isolated local SQLite database: home/version, hash-checked PDF delivery, all 12 eligible source questions, terminology save/load, repository approval retaining refinement history, saved worksheet creation and repository usage all passed. Evidence is under ignored `test-output/team-live-*.json` and `test-output/team-http-check.json`. No production repository data was changed. Browser automation exposed no browser, so the interface still needs interactive/visual verification. No deployment or Git push was performed.

After the user ran `pnpm cloud migrate`, read-only checks against the connected Supabase database confirmed migration `202609210001`, all terminology columns, the unique module/term index, row-level security, absence of anonymous/authenticated table grants, and a successful read through the app's `listTerminology` function. Evidence is in `test-output/team-cloud-migration-check.json`. This confirms migration and application read access; new terminology write/conflict behavior remains covered by local regression checks, not a live cloud write test. No database records were changed by verification.

## Source-check latency and saved worksheet assembly: 19 September 2026

Source lookup now keys only inputs used by retrieval, caches recent successful checks for one minute, rejects cancelled responses, and offers a retry after a 20-second timeout. Cloud source-bank loading uses one aggregate query instead of four queued queries, with a one-minute cache. Hidden repository UI does not fetch while generating. A live cloud measurement returned 128 source questions and four matching references in 5,820 ms on a cold connection and 1 ms using the cached bank. These are server-side samples, not browser latency guarantees; a cold connection still incurs latency.

Worksheet cards have drag/drop ordering within/across sections, keyboard/touch position and section menus, and main-topic/effective-difficulty metadata. Notifications are block elements with wrapping and spacing, addressing the supplied overlapping-message screenshots. Configurations persist in SQLite or the new private Supabase `worksheet_configs` table, including titles, sections/order, approved question IDs/revisions, instructions and Name/Class options. Save/open/update/copy/delete actions are provided; optimistic revisions prevent lost updates. Empty sections may be saved while planning. Changed/deleted questions require explicit refresh before export.

`pnpm typecheck`, the complete `pnpm test` suite, focused lint, `git diff --check` and `pnpm build:vercel` passed. Regression checks cover reorder boundaries and cross-section moves, retrieval dependency keys, saved configuration persistence after database reopen, duplicate rejection, revision conflicts, origin checks and lecturer solution ordering including alternatives. Existing export checks retain stale/deleted question rejection, mandatory answer keys, AI disclosure, native equations and editable shapes.

Applied `202609190001_worksheets.sql` to the connected Supabase project. Live checks verified create/list/open/update/delete, conflict rejection, persistence after reconnect and absence of anonymous/authenticated table read grants. The built Vercel function passed home/version, repository metadata, saved worksheet routes and export resolution against an approved question. Only uniquely created test worksheet configurations were deleted during cleanup; existing repository questions were unchanged.

Rendered the student (two pages) and lecturer (three pages) fixtures using the documents renderer, LibreOffice with Math and Poppler in an isolated Docker container. Inspected all five pages: lecturer question 1 is followed by its main/alternative solutions and marking before question 2; the answer key remains last. Equations, diagrams and AI disclosure render correctly. This is LibreOffice validation, not native Microsoft Word validation. Browser automation exposed no browser, so interactive dragging and the revised UI have not been visually verified in a browser.

## Similar-question controls and source structure: 19 September 2026

Similar mode hides creative context, multiple-part controls and additional specifications. A note directs users to refine after generation. Initial similar requests discard stale specifications before validation, and all similar planning, authoring, repair and review requests omit the hidden structure/context controls. Structured similar drafts use the selected source as their structural guide; requested part-count validation remains enabled for new questions. Refinement instructions and explicit repository replacement approval remain supported.

TypeScript, the complete regression suite, focused lint and the Vercel production build passed. Regressions cover stale invalid part counts and oversized specifications, standalone and multipart drafts, repair, refinement, repository approval/replacement, and retained mark/format checks. A live Azure request through the built function adapted source `EM1-EXAM-2425-S2-B3` into a four-part, 10-mark question with passing review despite stale hidden part settings. That live request preceded the additional-specifications change, which is covered by the final regression suite. Browser automation exposed no browser, so interactive UI verification remains outstanding.

## Remove the separate app login: 18 September 2026

Removed Basic authentication from page/API handling and removed the login fields from server configuration, environment examples and both ignored local environment files. Legacy `APP_USERNAME`/`APP_PASSWORD` values in Vercel are ignored, so no dashboard environment change is required. Hosting deployment protection is unchanged. Everyone who can reach the app shares its repository, source bank, traces and generation capacity.

TypeScript, the complete regression suite and the Vercel build passed. The built function returned 200 for the home page and repository/import/trace APIs without an Authorization header, including with legacy login variables set and with stale browser credentials. Reference retrieval, signed image access and security headers passed. Invalid approval payloads still returned 400, and cross-origin repository/import requests returned 403. Regression checks retain request-size and generation-capacity limits. No live provider generation was needed for this access-only change; hosted page verification remains subject to Vercel's own sign-in protection.

## Vercel routing middleware correction: 18 September 2026

The first hosted deployment reported `MIDDLEWARE_INVOCATION_FAILED`. The root `middleware.ts` collided with Vercel's automatic Other-framework routing middleware discovery, outside Vinext's aliases and Node server. Moved the unchanged authentication and security-header behavior to Vinext's `proxy.ts` convention. The build now rejects root middleware files to prevent this deployment conflict.

TypeScript, focused lint and the Vercel build passed. A negative build check confirmed that a root middleware collision fails before compilation. The built Node function returned 401 without login and 200 for authenticated home/repository/imports/traces/references; signed source images were accessible. Hosted runtime confirmation still requires opening the new deployment through Vercel's sign-in protection. The old deployment-specific URL retains its old build.

## Supabase and Vercel preparation: 18 September 2026

Configured the connected Supabase project with a private `studio` schema and `studio-sources` bucket, then seeded the existing EM1 module, 55 taxonomy records, 128 source questions and 140 source asset entries. No local SQLite database existed at the configured default path to migrate. The local app now selects Supabase storage; the original JSON source files remain unchanged.

TypeScript, the full standard regression suite, focused cloud-file lint and the Vercel production build passed. Standard tests force isolated local storage. Explicit live checks verified private schema/bucket permissions, source image downloads and signed links, PostgreSQL approval/search/deletion, concurrent replacement conflicts, traces/token usage/redaction, and shared generation capacity. The connection-pooling check exposed pipelining hangs; independent queries now reserve a connection and concurrent repository operations pass. Active taxonomy still requires a grounded excerpt; empty excerpts on existing deprecated historical tags no longer prevent source imports.

A synthetic PDF pair completed direct signed upload, real Azure extraction, persisted review, stale-review rejection, leased worker approval and cloud source promotion. Its temporary repository/import/source fixtures were removed afterward. Provider extraction traces remain as audit evidence. This checks one small pair, not exhaustive OCR/transcription accuracy or large-paper performance.

The built Vercel function was invoked locally with production settings: unauthenticated home returned 401; authenticated home, repository, imports, traces, references and private image access passed. A real Azure similar Structured generation through that function returned 200 with a passing review. No Vercel-hosted URL has yet been deployed or checked. Browser automation exposed no browser, so interactive cloud UI verification remains outstanding. Existing Word render checks below apply to the unchanged export layout.

Deployment instructions and an opt-in GitHub Actions import worker are included. The worker schedule is disabled until `ENABLE_PDF_WORKER=true` is configured in the repository variables. No automatic Vercel deployment or GitHub secret configuration was performed.

The final credential scan found no configured server credentials in 245 Git-visible files or 1,621 Vercel build files. Public source scans were excluded from the static build output. `.env` and `.env.vercel` are ignored by Git. `git diff --check` passed; the bank, module registry and crop manifest are unchanged. The live cloud cleanup check returned 128 source questions, zero test repository entries and zero test import jobs.

## Local repository, worksheets and imports: 18 September 2026

Implemented similar-question generation, local SQLite traces and approved revisions, module-qualified prompts, actionable configuration validation, paper assembly, and browser PDF upload/review. Student worksheets always include an answer key; lecturer exports additionally include all worked solutions and marking allocations.

Validated on Windows with Node 24.14.1. `pnpm typecheck`, the complete `pnpm test` suite, `pnpm build`, focused lint for the new feature files, and `git diff --check` passed. `pnpm bank validate` reports 128 valid questions. The production bank, module registry and crop manifest were unchanged by these tests.

- Database/API tests cover explicit approval, immutable revisions, refinement without changing the approved copy, replacement/deletion conflicts, deletion exclusion, persistence after reopening and in a separate Node process, authentication, and rejection of stale worksheet selections.
- Local audit tests cover concurrent trace isolation, per-call provider/model/usage, errors, prompt identity, credential/image/reasoning redaction, content opt-out, and absence of telemetry network calls.
- Generation tests cover compatible random source selection, a fixed source through planning/authoring/review, preserved refinement provenance, configuration recommendations, module prompt inheritance/hashes, and rejection of a repair that removes the answer key. Existing MCQ, calculator, scope, format and repair regressions also pass.
- Import tests cover multipart validation, path containment, preserved extraction coverage, approval gates, transient retries, nested LaTeX marking JSON, standalone question grouping, and isolated EM2 promotion with real PDF rendering/cropping and backups.

Live HTTP checks used an isolated SQLite database under ignored `test-output/browser-qa/`. One Azure similar Structured question passed review, recorded its source and current calculator checks, and was approved/reopened/assembled in that test database. Its local trace contains nine provider calls. A synthetic question/solution PDF pair completed upload, local PDF processing, real provider extraction and saved review; retry from stored PDFs was exercised. The synthetic paper remains unapproved and was not committed to the production source bank. These are individual live checks, not exhaustive provider/topic coverage.

Both worksheet variants were exported and rendered using the documents renderer with LibreOffice, its Math component and Poppler in an isolated Docker container. Every page was visually inspected: two student pages and three lecturer pages, including equations, filled editable diagrams, section headings, Name/Class fields, instructions, the AI disclosure, the answer key and worked solutions. XML checks separately confirm editable geometry and native equations. Native Microsoft Word automation did not complete, so this is LibreOffice render validation rather than Microsoft Word visual validation.

The browser automation service exposed no available browser, so interactive browser flows remain unverified. The HTTP home page and APIs were checked; TypeScript and the production bundle passed. No deployment or Git push was performed. The existing Langfuse Docker services were left running; the application no longer sends Langfuse telemetry.

Reproduce with the commands above after installing `requirements-import.txt`. The feature suite writes the latest fixture path to `test-output/latest-feature-fixtures.json`. Live provider checks require configured credentials and incur provider charges; the standard automated suite uses mocked provider responses.

## Follow-up: stale related-rate calculation history

Separated exploratory authoring history from current-draft review calculations and enabled bounded calculator access during independent review. Each revision starts a fresh ledger; failed expressions never enter the successful-check list. Regression tests evaluated `(0.045*pi)/(pi*6^2/4)` as 0.005 and `(0.045*pi)/(pi*9^2/4)` as 1/450, excluded a failed comma expression and verified the tool-round limit. TypeScript and build passed.

A live Azure request using the same inflow, volume relationship and heights returned HTTP 200 with correct related rates and a passing scope/format review. That reviewer chose not to call the calculator, so its returned current-check ledger was empty; numerical checks were independently executed by the regression test. This distinguishes model review from actual tool verification.

## Follow-up: MCQ mathematical formatting

Added a bounded formatting repair before semantic review, including revalidation and candidate replacement on persistent invalid notation. Regression tests use an actual mismatched matrix environment and verify successful repair, bounded failure and preservation of unrelated validation errors. TypeScript and production build passed.

A live HTTP request through the existing local server, using the current Azure `.env` configuration, returned 200 with three Matrices and Determinants MCQs: matrix multiplication conformability/order, inverse of a scalar multiple of a transpose, and cofactor expansion. All three had four options, 2 marks and passing reviews. The original failed response was not retained, so its exact malformed expression could not be identified; this verifies the repaired pipeline and one successful live batch, not immunity from future model errors.

## Follow-up: server-only credentials

Removed all browser API-key, provider, Azure endpoint and deployment controls. Browser requests no longer contain provider keys or connection settings. Tested that connection overrides are rejected (400) and a browser key cannot substitute for missing server configuration (422, without a provider call). TypeScript, the question/provider/retry regression suites, the new `env-only-check` and production build passed.

The current local `.env` had Azure credentials but selected/defaulted to OpenAI. Set `AI_PROVIDER=azure` without modifying the credentials. A live request through the local HTTP generation endpoint returned 200 using Azure, produced a 2-mark Basic matrix element-identification question and passed scope/format review with no issues. The page returned 200 with no password input or provider control. This tests one Structured generation; it does not establish that every provider, topic or MCQ configuration works.

## Original migration checks

Validated locally on 12 September 2026 (Singapore), using Windows, Node 24.14.1 and Python 3.12.14. PDF tooling: pypdfium2 5.13.0 and Pillow 12.3.0.

| Check | Result |
| --- | --- |
| TypeScript `--noEmit` | Passed |
| Existing question/graph/Word/repair regression suite | Passed |
| Simulated provider adapter suite | Passed |
| Interrupted-response retry suite | Passed |
| Server configuration and request guards | Passed |
| PDF page render, extracted text and SHA-256 | Passed with a real synthetic PDF |
| Isolated EM2 import promotion | Passed; creates bank row, module and crop |
| Unverified import rejection | Passed |
| Duplicate paper rejection | Passed |
| Import backups and sub-topic deprecation | Passed |
| Bank validation | 128 existing EM1 questions; valid IDs and taxonomy |
| Original bank/crop-manifest preservation | No changes to existing bank or crop manifest |
| Node production build | Passed |
| Development HTTP home / reference retrieval / crop | 200 / 200 / 200 |
| Built Node server without required login | 401 |
| Built Node server with login | 200; server-credential UI shown |
| Dummy provider secret in HTML | Absent |
| Cross-origin API request | 403 |
| Authenticated reference request | 200 |
| Malformed generation brief | 400 before provider call |
| Response framing header | X-Frame-Options: DENY |

The sample compact few-shot payload decreased from 8,933 to 2,847 characters, retaining questions, all available solutions and source rubrics. Direct production/development dependencies decreased from 40 to 28. Only five UI component files remain; unused starter components and redundant full-page screenshots were removed from the active source tree. The exact final source count includes documentation and new import tools; dependency/build/test folders are ignored by Git.

Tests use synthetic credentials and mocked provider responses. No real provider key was used for migration validation. Live PDF-to-model extraction, real EM2 generation, paid model access and Desmos service rendering were not tested during this migration. The isolated import test covers promotion and PDF/image processing, not OCR/model transcription accuracy. No GitHub push or hosted-site deployment was performed.

To reproduce: install Node/pnpm and the Python import dependencies, then run `pnpm typecheck`, `pnpm test`, `pnpm bank validate`, `pnpm build` and `pnpm start`. Test outputs are written under the ignored `test-output/` folder. For a live smoke test, configure a valid `.env`, generate one short Structured question and one three-candidate MCQ set, refine one, and export Word. For ingestion, first use a small dated paper/solution pair, compare every extracted row with the PDF, and promote only after review.

Cleanup limitation: the execution environment rejected recursive folder deletion. Obsolete resources were moved outside the active repository into `../retired-project-files/` where possible. The old `../em1-studio/` folder can contain locked residual dependencies/files after an interrupted move. Neither folder is used by this project; close applications holding them and delete them manually if no longer wanted.
