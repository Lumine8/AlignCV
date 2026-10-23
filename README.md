# AlignCV

**Understand the job. Prove your fit. Optimize your resume.**

AlignCV is a resume intelligence and LaTeX tool. It reads a job posting and your
resume, runs **traditional** and **semantic** matching side by side, reconciles
them into transparent metrics with **evidence for every claim**, and generates a
truthful, tailored LaTeX resume you can download.

The frontend is **local-first**: the static build works with no server, database,
or API key, and stores projects in your browser. An optional **FastAPI backend**
adds server-side resume parsing, job-URL extraction and LaTeX compilation when
configured; without it, AlignCV keeps working in fully local browser mode.

> AlignCV presents **its own** match estimates. They are **not** any employer's
> ATS score and **not** a probability of receiving an interview.

---

## Highlights

- **Local-first** — the static frontend runs with no server, database, or secrets.
  A FastAPI backend is optional and used only when `VITE_API_BASE_URL` is set.
- **Resume ingestion** — `.tex` (LaTeX-preserving parser) and `.pdf` (via
  [PDF.js](https://mozilla.github.io/pdf.js/): text extraction, link recovery,
  scanned-page detection). When the optional backend is configured, uploads can
  instead be parsed server-side with `pypdf` and the same conservative
  reconstruction rules, with automatic fallback to the browser parser.
- **Job extraction** — paste text directly (or use the **Paste from clipboard**
  button), or import a public URL. Postings hosted on **Greenhouse, Lever, Ashby
  or SmartRecruiters** are read from each platform's own public, CORS-enabled
  JSON API; other pages use a CORS-aware HTML fetch that asks you to paste
  instead when a site blocks browser access. With the optional backend enabled,
  the server fetches the posting (SSRF-guarded) before falling back to the
  browser.
- **Traditional engine** — exact + alias matching, must-have vs preferred rules,
  experience-duration derivation, a configurable skill dictionary.
- **Semantic engine** — optional **local AI embeddings** via
  [Transformers.js](https://github.com/huggingface/transformers.js) running on
  your device, with a deterministic **lexical-embedding** fallback that needs no
  download.
- **Reconciliation engine** — independent Traditional / Semantic / Hybrid /
  Parseability / Evidence metrics, hard requirements reported separately, and
  engine-disagreement explanations.
- **Optimization** — only reorders or re-emphasizes existing content. Missing
  information becomes a **clarifying question**, never a fabricated claim.
- **LaTeX export** — always generates clean, editable `.tex`. Optional
  in-browser PDF compilation is honest: if no engine is available, you get the
  source plus Overleaf instructions rather than a false "compiled" claim.
- **Local persistence** — resumes, jobs, analyses and versions are stored in
  IndexedDB on your device, with export/import and one-click deletion.

### Truthfulness guardrails

- Never invents employment, education, certifications, dates, metrics, skills,
  publications, or achievements.
- Never turns academic or personal projects into professional employment.
- Never adds a skill just because it appears in the job description.
- Flags any user edit that introduces unsupported claims **before** applying it.

---

## The workflow

1. **Workspace** — upload a `.tex` or `.pdf` resume, then add a job posting
   (URL or pasted text). Choose the semantic engine (lexical or local AI).
2. **Match report** — see the traditional, semantic, hybrid, parseability and
   evidence-confidence metrics, plus every requirement with its evidence,
   status, method and notes. Hard requirements are listed independently.
3. **Review** — accept, edit or reject each suggestion. Every suggestion shows
   its original text, proposed change, reason and supporting evidence.
4. **Compile & export** — validate the LaTeX source, optionally compile to PDF
   in the browser, and download `.tex` (and `.pdf` when available).

Your original resume is preserved as an immutable baseline; accepted changes
create separate versions.

---

## Quick start

Requirements: **Node.js 18+** (built and tested on Node 22) and npm.

```powershell
# from the repository root
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

### Optional backend

Requirements: **Python 3.11+** (tested on 3.12).

```powershell
# from the repository root
Copy-Item backend\.env.example backend\.env
powershell -ExecutionPolicy Bypass -File scripts\backend-dev.ps1
```

The API is then available at http://localhost:8000 (`GET /api/health`, or the
`/health` convenience alias). To point
the frontend at it, copy `frontend\.env.example` to `frontend\.env`; leaving
`VITE_API_BASE_URL` empty keeps the app in local browser mode.

### Environment files and secrets

- Copy `backend\.env.example` and `frontend\.env.example`; never commit the real
  `.env` files.
- `.gitignore` excludes `.env`, `.env.*` (except examples), virtual
  environments, Python caches, coverage output, logs, build output, and local
  test artifacts.
- Put API keys and other credentials in `.env` files, host environment
  variables, or your deployment provider's secret store. Do not put secrets in
  source files, docs, or committed configuration.

Helper scripts (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1          # frontend dev server
powershell -ExecutionPolicy Bypass -File scripts/backend-dev.ps1  # FastAPI dev server
powershell -ExecutionPolicy Bypass -File scripts/build.ps1        # static build
powershell -ExecutionPolicy Bypass -File scripts/test.ps1         # backend + frontend tests
```

---

## Testing

The ported engines are covered by a [Vitest](https://vitest.dev/) suite
(`frontend/test/`) — text/date utilities, the skill dictionary, `.tex` parsing,
job structuring, ATS URL resolution, both matching engines, hybrid
reconciliation, the suggestion/claim guards, LaTeX rendering + validation, and
the clipboard reader's permission/fallback paths. `backendFlow.test.js` runs a
backend-parsed resume and structured job through matching → review → apply →
export to catch adapter/shape regressions.

```powershell
cd frontend
npm test          # run once
npm run test:watch
```

Run `npm test` and `npm run build` before committing.

### Backend

Always use the project virtual environment; a system or conda `pytest` may
crash while loading unrelated third-party plugins and report tests as failed or
skipped. Both pytest configs disable Anaconda's unrelated `dash` plugin
(`addopts = -p no:dash`), which otherwise fails before collection with
`ModuleNotFoundError: importlib_metadata`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

From the repository root, `scripts\test.ps1` runs both suites with the correct
interpreters (the root `pytest.ini` also makes `backend\.venv\Scripts\python.exe -m pytest`
work from the root). Backend tests cover the schemas, LaTeX render/compile
routes, `.tex`/PDF parsing, job structuring, ATS URL parsing, SSRF/URL guards,
upload limits, and HTML/JSON-LD cleaning.

---

## Backend (FastAPI)

`backend/app/` is a modular FastAPI service:

| Path | Responsibility |
| --- | --- |
| `main.py` | App factory, CORS, error handlers |
| `config.py` | Environment-driven settings (`ALIGNCV_*`) |
| `errors.py` | Client-safe error codes |
| `schemas/` | Shared Pydantic models (resume, job, analysis, latex) |
| `services/latex/render.py` | Structured model → ATS-safe LaTeX (`ats`, `classic`) |
| `services/latex/compile.py` | Engine detection + isolated compilation |
| `services/latex/validate.py` | PDF text extraction + content checks |
| `services/parsing/tex.py` | Server-side `.tex` parsing → structured resume |
| `services/parsing/pdf.py` | `pypdf` text/link extraction + reconstruction |
| `services/jobs/extract.py` | Deterministic job-requirement structuring |
| `services/jobs/fetch.py` | SSRF-guarded fetch, HTML/JSON-LD, ATS adapters |
| `services/skills.py` | Skill aliases and canonicalization |
| `api/routes/` | HTTP routes (`/api/health` and `/health`, `/api/latex/*`, `/api/resumes/*`, `/api/jobs/*`) |

Implemented now: health/capabilities, CORS allow-list, the shared resume/job/
analysis schemas, LaTeX rendering with two single-column templates, sandboxed
compilation (tectonic/pdflatex detection), PDF validation against the structured
document, `.tex`/PDF resume parsing into the shared resume model, and secure
server-side job extraction (HTML, JSON-LD, ATS APIs).

### Parsing and job endpoints

- `POST /api/resumes/parse` — multipart `file` (`.tex` or `.pdf`, default 10 MB
  limit) → `{document, source_type, filename, original_text, raw_tex,
  parse_confidence, warnings}`. Scanned/image-only PDFs return a clear
  `parse_failed` error instead of fabricated content.
- `POST /api/jobs/extract` — either `{url}` or `{text, title?, company?}` →
  `{status: "ok", job}`. Requirements keep their source wording and include
  category, required/preferred importance, must-have/critical flags, minimum
  years when stated, and canonical skill keywords.

### LaTeX endpoints

- `POST /api/latex/render` — `{document, template?}` → `{source, template, warnings}`.
  Escapes user text, follows `metadata.section_order` and `metadata.date_format`.
- `POST /api/latex/compile` — `{document | source, template?, run_validation?}`.
  Always returns the generated `source`. `status` is `success` (with base64 PDF
  bytes), `unavailable` (no engine installed), or `failed` (with log/errors).

Templates (`ats`, `classic`) change typography and margins only; content is
identical. Unsupported templates return the `invalid_template` error code.

### Security defaults

- CORS is an explicit allow-list (`ALIGNCV_CORS_ORIGINS`).
- Upload, fetch, and compilation size/time limits are configurable.
- Job URL fetches allow only public http(s) hosts on standard ports, reject
  credentials and private/loopback/link-local addresses (including DNS results),
  re-validate every redirect, and cap response size/time. There is no LinkedIn
  scraping, login bypass, CAPTCHA solving, or anti-bot circumvention.
- LaTeX runs with `-no-shell-escape`, a minimal environment, a temporary
  directory, and a hard timeout; no user-supplied shell commands are executed.
- API errors return stable `code` values instead of internal paths.

### Deploying the backend (Render)

1. Create a Render Web Service with root directory `backend/`.
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set `ALIGNCV_CORS_ORIGINS` to your deployed frontend origin.
5. Set `ALIGNCV_ENVIRONMENT=production` and `ALIGNCV_DEBUG=false`.

Install `tectonic` (or TeX Live) in the image for server-side PDF compilation;
otherwise `/api/health` reports `latex_compilation_available: false` and the app
still exports `.tex`.

---

## Implementation status

This repository is being built in phases.

- **Phase 1 — complete:** backend scaffold (app factory, settings, CORS, error
  envelope), shared Pydantic schemas, LaTeX engine detection/compilation, health
  route, tests, env examples, dev scripts.
- **Phase 2 — complete:** shared structured resume model (normalized dates,
  validation, engine adapter), seven-step Create wizard at `/create` with
  autosaved drafts, add/remove/reorder entries and sections, date-format and
  section-order settings, review screen, save to IndexedDB, JSON download, and
  a hand-off into the analysis workspace.
- **Phase 3 — complete:** LaTeX rendering for the structured model with `ats`
  and `classic` templates, ordered sections, normalized date formats, safe
  escaping, and link handling; `/api/latex/render` and `/api/latex/compile`
  endpoints; PDF text extraction/validation; offline `.tex` download in the
  Create wizard plus optional backend PDF compilation with honest
  `unavailable`/`failed` states.
- **Phase 4 — complete:** server-side `.tex`/PDF parsing into the shared
  `ResumeDocument`; deterministic job structuring with requirement categories,
  required/preferred importance and minimum years; SSRF-guarded job URL
  fetching with HTML/JSON-LD cleaning and Greenhouse/Lever/Ashby/
  SmartRecruiters adapters; `/api/resumes/parse` and `/api/jobs/extract`; the
  optional frontend now uses these endpoints for uploads and job imports with
  automatic browser fallback.
- **Phase 5 — complete:** end-to-end QA of backend-parsed resumes/jobs through
  the browser matching → review → apply → export pipeline. Parsed section order,
  date format and template now survive export; flat skills participate in
  semantic matching; backend `constraint` requirements keep the
  location/authorization uncertainty rule; layout changes update the export order.
- **Next:** deployment hardening and final documentation review.

The current development machine has no LaTeX engine, so PDF compilation is
reported as `unavailable` here; `.tex` export and all backend render/validation
tests still run. Server-side PDF compilation requires installing Tectonic or TeX
Live.

---

## Deploying as a static site

The production build is plain static files, so any static host works. The app
uses **HashRouter** and relative asset paths (`base: "./"`), so it works at a
domain root, in a subdirectory, or on GitHub Pages with **no rewrite rules**.

### Build

```powershell
cd frontend
npm run build
```

Output goes to `frontend/dist`.

### Vercel

A root `vercel.json` is included. Import the repository into Vercel and it will:

- run `cd frontend && npm install && npm run build`
- publish `frontend/dist`

Or deploy the CLI directly from the `frontend` directory (`vercel`) and set the
output directory to `dist`.

### GitHub Pages

1. `cd frontend && npm run build`
2. Publish the contents of `frontend/dist` to your Pages branch (e.g. via a
   `gh-pages` action or by copying the folder).

Because routing is hash-based, no `404.html` shim is required. If you prefer
path-based URLs, switch `HashRouter` to `BrowserRouter` in
`frontend/src/main.jsx` and add your host's SPA fallback.

---

## How matching works

`frontend/src/lib/` contains a faithful JavaScript port of the original Python
engines:

| Module | Responsibility |
| --- | --- |
| `text.js` | LaTeX-to-text, comment stripping, brace/date parsing, ids |
| `skills.js` | Skill dictionary with legitimate aliases + tokenizer |
| `texParser.js` | `.tex` → structured resume (sections, items, skills) |
| `pdfExtractor.js` | PDF.js extraction → structured resume |
| `jobExtractor.js` | Job text structuring + ATS public-API + CORS-aware URL fetch |
| `matching/index.js` | Searchable resume index + experience duration |
| `matching/traditional.js` | Deterministic exact/alias/rule matching |
| `matching/semantic.js` | Embedding matching (local AI or lexical) |
| `matching/reconciliation.js` | Hybrid metrics, disagreements, fingerprint |
| `optimization/suggestions.js` | Evidence-backed suggestions + claim guard |
| `latex/render.js` | LaTeX generation + applying approved changes |
| `latex/validate.js` | Source pre-flight and (when compiled) PDF validation |
| `latex/compile.js` | Optional in-browser PDF compilation hook |
| `embeddings.js` + `workers/embedding.worker.js` | Transformers.js worker |
| `storage/db.js` | IndexedDB persistence + project export/import |
| `engine.js` | Facade that mirrors the old HTTP API surface |

**Metrics are kept separate on purpose.** A strong hybrid score never overrides
a missing hard requirement.

### Semantic engines

- **Lexical (default)** — deterministic token + character n-gram cosine
  similarity with alias expansion. Fully offline, no download.
- **Local AI** — `Xenova/all-MiniLM-L6-v2` via Transformers.js in a Web Worker.
  The model is downloaded once (about 25 MB) and cached by the browser; inference
  runs on your device. If the model cannot load, AlignCV falls back to lexical
  matching and says so.

### LaTeX compilation

PDF compilation in the browser is **optional and opt-in**. AlignCV always
generates and validates `.tex` source and offers it for download (with Overleaf
instructions). If you host a WASM LaTeX engine, expose it as
`window.ALIGNCV_LATEX_ENGINE` — an `async (texString) => ({ pdf: Uint8Array, logs })`
function — and AlignCV will compile and then validate the PDF text. Without it,
the UI never claims a PDF was produced.

---

## Privacy & data

- AlignCV runs fully in the browser by default. An optional FastAPI backend adds
  server-side resume parsing, job extraction, and PDF compilation; it is not
  required.
- With the backend enabled, the resume file, job URL, or job description you
  submit is sent to it for parsing/extraction. Without the backend, those paths
  use the browser fallback.
- Parsed resumes, jobs, analyses and versions live in **IndexedDB** in your
  browser, keyed by an anonymous local id.
- Local AI runs on your hardware; the only network request is the one-time model
  download from Hugging Face (skipped in lexical mode).
- Use **Export project** to save a JSON snapshot, **Import project** to restore
  it, and **Clear local data** to delete everything from the browser.

---

## Limitations (honest by design)

- Scores are AlignCV's estimates, not an ATS's.
- Browser CORS blocks some job URLs (Greenhouse/Lever/Ashby/SmartRecruiters are
  supported via their public APIs); paste the description for the rest.
- The lexical semantic fallback estimates relatedness, not proof of experience.
- PDF resume parsing cannot recover the original LaTeX, so it reconstructs a
  clean editable representation.
- In-browser PDF compilation is not bundled; `.tex` export always works. The
  optional backend compiles PDFs only when Tectonic or TeX Live is installed.

---

## Project structure

```
AlignCV/
├─ frontend/
│  ├─ src/
│  │  ├─ api/client.js        # local engine facade (keeps pages unchanged)
│  │  ├─ components/          # Layout, Stepper, create/ form primitives, ...
│  │  ├─ lib/                 # local engines (see table above)
│  │  │  └─ resume/           # structured model + draft/IndexedDB storage
│  │  ├─ pages/               # Landing, CreateResume, Workspace, MatchReport, Editor, Export
│  │  ├─ state/session.jsx    # workflow state (localStorage)
│  │  └─ styles/              # SCSS
│  ├─ test/                   # Vitest suite + fixtures
│  ├─ index.html
│  └─ vite.config.js
├─ backend/
│  ├─ app/
│  │  ├─ api/routes/          # health, latex, resume parsing, job extraction
│  │  ├─ schemas/             # shared Pydantic models
│  │  └─ services/            # latex/, parsing/, jobs/, skills dictionary
│  ├─ tests/                  # pytest suite
│  ├─ requirements.txt
│  ├─ requirements-dev.txt
│  ├─ pyproject.toml
│  └─ .env.example
├─ scripts/                   # dev / backend-dev / build / test
├─ pytest.ini
├─ vercel.json
└─ README.md
```

---

## License

See [LICENSE](./LICENSE).
