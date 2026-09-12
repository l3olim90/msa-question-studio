# Migration validation

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
