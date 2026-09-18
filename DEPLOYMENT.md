# Vercel and Supabase

The Vercel site runs the app; Supabase PostgreSQL stores the approved repository, revisions, audit traces, module syllabus, source questions and import queue. Supabase private Storage holds PDFs and source images. The same database can serve local development and the hosted app, so approved questions survive sessions and deployments.

The app has no separate username/password login. Vercel deployment protection controls access to the hosted site. Everyone who can reach the app shares the repository, source bank, traces and generation capacity; individual accounts and per-user permissions are not implemented. If hosting protection is disabled, anyone who can reach the URL can use these features.

## 1. Configure server credentials

Keep credentials in the ignored `.env` file. Never paste them into chat, commit them, or prefix them with `VITE_` or `NEXT_PUBLIC_`.

```dotenv
STUDIO_STORAGE=supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR-SERVER-SECRET-KEY
DATABASE_URL=YOUR-TRANSACTION-POOLER-CONNECTION-STRING
```

In Supabase, find the secret key under **Project Settings → API Keys** (the server secret, not the publishable key). Find the PostgreSQL URL under **Connect → Transaction pooler**; use port 6543, replace the password placeholder, and URL-encode special characters in the password. It is a different credential from the API key. This app disables prepared statements and reserves connections to avoid pipelining independent transactions through the pooler.

Keep the existing active AI provider settings from `.env`. For Azure, these are `AI_PROVIDER=azure`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, and `AZURE_OPENAI_CHAT_DEPLOYMENT_NAME`. Optional `DESMOS_API_KEY` enables graph rendering. `AUDIT_CAPTURE_CONTENT=false` stores trace metadata without prompt/question content; the default is true with credential redaction.

## 2. Initialize Supabase once

From the repository terminal:

```powershell
pnpm cloud check
pnpm cloud migrate
pnpm cloud seed
pnpm cloud migrate-local
```

These commands have already been run for the initial connected project. Repeat them only when initializing another project, applying migrations or adding seed data. They are safe to rerun: existing source records and repository revisions are preserved. `migrate-local` reads the configured local SQLite database without deleting it; if none exists, it reports that there is nothing to copy. It does not migrate unfinished local PDF imports; finish those locally or upload the PDF pair again after switching.

Tables are under the **studio** schema in Supabase, not `public`. Browser `anon` and `authenticated` roles have no access. Do not expose that schema through the Data API or make the `studio-sources` bucket public. The app accesses data on the server and creates short-lived storage links through its API.

## 3. Deploy the repository to Vercel

Commit and push the application changes, excluding `.env`, databases, uploads and `test-output/`. In Vercel choose **Add New → Project**, import the GitHub repository, and use these settings:

| Setting | Value |
| --- | --- |
| Root directory | Folder containing `package.json` (normally repository root) |
| Framework preset | Other |
| Node.js | 24.x |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build:vercel` |

`vercel.json` supplies the build configuration. Vinext and Nitro generate Vercel's `.vercel/output` Build Output API package, including server functions and module prompt files. This is a Vinext app, so do not select the Next.js framework preset. The adapter is pinned to a beta release; validate before upgrading it.

Response security headers are implemented in the root `proxy.ts`, which Vinext bundles inside its Node server. Do not rename it to `middleware.ts` or add a Vercel `proxy.entrypoint`: those cause Vercel to build separate platform routing middleware outside the app's Vite aliases and runtime. The build rejects root middleware files to catch this conflict before deployment.

Add the cloud and active provider variables from step 1 to Vercel's **Environment Variables** before deploying. Do not use `STUDIO_DB_PATH` or the local Python path. Set `STUDIO_STORAGE=supabase`. Environment changes require a new deployment. Set production credentials for Production; connect Preview deployments only if you intend them to share the live repository, or use a separate Supabase project for previews.

For this setup, an ignored `.env.vercel` file has been prepared containing only the deployment variables. Use Vercel's environment-variable import/paste control to transfer it privately. It contains real credentials and must stay out of Git. Regenerate or update it if credentials change. Legacy `APP_USERNAME` and `APP_PASSWORD` variables are ignored by the app and can be removed from Vercel settings.

Open the deployed URL; sign into Vercel if its deployment protection requests it. The app does not show an additional login prompt. Check reference images, generate one small question, approve it, reload, reopen it from the repository, and export both worksheet versions. The deployed URL needs its own smoke test; a successful local build does not establish that a Vercel deployment works.

## 4. Enable PDF processing

Vercel receives import metadata; the browser uploads each PDF directly to private Storage. Extraction and approval run in a separate worker because Python PDF rendering and long AI calls must survive a web request ending. Saved reviews and queue state remain in Supabase.

For immediate use on this computer:

```powershell
python -m pip install -r requirements-import.txt
pnpm worker
```

Each run processes up to three queued operations and exits. Run it after upload and again after approving a reviewed import, or enable the included GitHub worker for unattended processing:

1. In the repository, open **Settings → Secrets and variables → Actions → Secrets**. Add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `AI_PROVIDER`, and the active provider's settings listed above as repository secrets.
2. In **Actions**, choose **Process PDF imports → Run workflow**. Confirm it succeeds.
3. Under **Settings → Secrets and variables → Actions → Variables**, create `ENABLE_PDF_WORKER` with value `true` to enable scheduled processing. Leave it unset to use manual runs only.

Scheduled runs require the workflow on the default branch. The five-minute schedule can be delayed by GitHub and consumes Actions minutes, including startup when the queue is empty. Remove the variable or set it to `false` to disable the schedule. A run has a 90-minute limit; each extraction has a 25-minute limit and suggests splitting large papers when exceeded. Interrupted jobs use leases and bounded retries. The app shows when the worker was last seen.

After extraction, verify every question, solution, syllabus mapping, crop and marking allocation against the original PDFs. Approve the reviewed import to queue promotion into the source bank. Uploaded PDFs alone do not become few-shot examples. Reload after adding a module; source changes are cached for at most 15 seconds per app instance.

## Modules, backups and limits

- Keep one database and use module IDs such as EM1/EM2. To add a module, prepare its module/taxonomy/source data using the documented bank CLI workflow, validate it, then run `pnpm cloud seed` to add new IDs. Seed deliberately does not overwrite existing cloud rows. Existing cloud syllabus changes need an explicit migration; they are not synchronized by editing a local JSON file.
- Module prompt files remain versioned in Git under `prompts/`. On Vercel, redeploy after prompt changes; the build copies those files into the function. A local server reads prompt edits directly.
- Back up both PostgreSQL and private Storage. Database backups alone do not contain the PDF/image bytes. No automatic trace-retention purge or per-user access isolation is implemented.
- Vercel generation functions allow up to 300 seconds in this configuration. Long generations may need smaller requests. PDF imports use the durable worker; question generation remains a web request. Direct PDF uploads avoid Vercel's 4.5 MB request-body limit.
- `STUDIO_STORAGE=local` still uses local SQLite and the local source files. It is suitable for one persistent computer, not Vercel. Switching modes does not synchronize later edits between the two stores.

## Checks

`pnpm typecheck`, `pnpm test`, and `pnpm build:vercel` do not require cloud writes. Standard regression tests force isolated local storage. `pnpm cloud:verify --live-import` is an explicit integration check that writes temporary fixtures to the configured cloud project and invokes the configured AI provider; it removes its own fixtures afterward and requires the regression fixture in `test-output/` plus Python dependencies. It is not run automatically during deployment.

References: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vinext deployment](https://github.com/cloudflare/vinext#other-platforms-via-nitro), [Vercel Build Output API](https://vercel.com/docs/build-output-api), [Vercel function limits](https://vercel.com/docs/functions/limitations), [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
