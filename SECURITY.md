# Prototype security review

Reviewed: 2026-09-21. This is a bounded application review, not an independent penetration-test certification.

## Access decision

The owner explicitly chose to keep the prototype and GitHub repository public. There is no staff authentication or per-user authorization. Anyone who can reach the production URL can use generation capacity, read the repository, change shared questions/worksheets/terminology and submit source imports. Origin checks, revision checks and model guardrails do not identify staff. Staff sign-in and authorization remain future work.

Prompt files in the public Git repository remain public, including their history and any existing copies. Never put credentials in prompts. The fixes below prevent unintended disclosure through the application; they do not make public source files confidential.

## Findings and changes

| Finding | Change |
| --- | --- |
| Anonymous trace detail responses exposed complete provider instructions and content, including historic records. | Trace queries now select metadata and usage columns explicitly. Inputs, outputs and raw errors are absent from both detail responses and downloads, including for legacy records. No historical database records were deleted. |
| Provider instructions were saved by default. | Content capture is opt-in; instructions and nested system/user-instruction fields are removed even when capture is enabled. Existing explicit true settings retain redacted question data in the server database only. |
| Context, refinement text and stored wording rules could carry prompt injection or inappropriate language. | Server-side Unicode-normalized screening; an independent structured safety decision for free-text generation/refinement and terminology saves; source/draft/rule checks; a central professional-conduct policy on every provider call. Failed or malformed safety decisions stop the request. |
| A model response could expose instructions/credentials or include inappropriate content. | Check visible provider output, including tool arguments and encoded JSON strings, before returning/logging it. Reject common abuse patterns, configured secret values and long exact instruction fragments. The assessment reviewer also checks professional conduct. |
| Raw database/provider errors and import logs could disclose implementation or prompt details. | Unexpected errors receive generic responses; provider errors expose only known diagnostic identifiers and fixed messages. Raw import logs/errors remain server-side. Quality and content failures are not automatically retried. |
| Client-submitted stored references could introduce external or executable image links. | Reference URLs allow only app source routes and embedded PNG/JPEG images; external/protocol-relative URLs, SVG data URLs, traversal and executable URLs are rejected. |
| Dependency advisories affected React Server Components, Vite and esbuild. | Upgrade React/React DOM/RSC to 19.2.8, Vite to 8.0.16 and esbuild to 0.28.1. |
| Two image-size 2.0.2 parser denial-of-service advisories have no published fixed version. | Committed pnpm patch blocks ICNS, HEIF/AVIF, JXL and JXL-stream decoding in both ESM/CJS buffer/file entry points. These formats are unused by this app. PNG/JPEG remain supported. |

The image-size advisories are [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq). The package-version audit still reports these **two high advisories** because a local patch does not change the upstream version. Do not describe the audit as clean. The mitigation applies to the standard entry points Vinext uses, not arbitrary direct imports of image-size internal format decoders. Reassess the patch when updating Vinext/image-size.

## Validation and limits

- Automated security regression: 17 adversarial strings exercised through both additional-context and refinement API paths; no provider call on deterministic rejection. Includes forged roles, instruction extraction, Unicode/zero-width/spacing obfuscation, vulgar language and active content.
- Benign mathematics/refinement cases, semantic rejection and fail-closed malformed decisions, output and credential leakage, legacy trace projection, error redaction, shared-rule persistence guards, source URL restrictions, origin/size/schema checks, calculator restrictions and isolated image-decoder probes.
- Live configured Azure provider: two legitimate requests accepted; indirect instruction disclosure, multilingual profanity and a spoofed safety classification rejected (five cases). This small set is evidence of behaviour, not a universal detection guarantee.
- Existing repository compatibility: all 69 reference-image URLs across 14 approved questions passed the new source-URL checks. No approved questions were changed. Configured-secret scanning found no values in 274 Git-visible files or 87 public build assets; the central prompt policy was absent from public assets.
- Source-browser tests: identical filters across three bounded attempts, transient recovery, per-attempt timeout, permanent error handling, cancellation and stale-response rejection.
- Full regression suite, TypeScript checks, focused lint and Vercel production build. Browser visual/interactive QA was unavailable in this environment.

Input screening and model reviews can miss novel, encoded, indirect or multilingual attacks and can occasionally reject legitimate text. Model outputs still require lecturer review. The model has no filesystem, database, messaging or network tool; only bounded mathematical calculation tools. Configured provider hosts, request-body limits, source-path containment, database parameterization and generation-capacity leases remain in place.

Public access deliberately leaves anonymous modification, scraping, storage/cost abuse and availability risks. Global generation limits bound usage but do not provide per-person quotas. No production deletion, hostile upload, destructive database test or load/denial-of-service test was performed. Local fixtures and isolated databases were used for mutation tests. Before wider sensitive use, implement staff authentication, authorization, quotas and retention controls.

The layered approach follows the [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html); no prompt wording is treated as an access-control boundary.
