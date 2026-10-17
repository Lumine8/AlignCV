# AlignCV

**Understand the job. Prove your fit. Optimize your resume.**

AlignCV is a **100% client-side** resume intelligence and LaTeX tool. It reads a
job posting and your resume, runs **traditional** and **semantic** matching side
by side, reconciles them into transparent metrics with **evidence for every
claim**, and generates a truthful, tailored LaTeX resume you can download.

Everything runs in your browser. There is no backend, no account, no API key,
and no server that receives your data.

> AlignCV presents **its own** match estimates. They are **not** any employer's
> ATS score and **not** a probability of receiving an interview.

---

## Highlights

- **Runs entirely in the browser** — deploy as a static site. No server, no
  database, no secrets.
- **Resume ingestion** — `.tex` (LaTeX-preserving parser) and `.pdf` (via
  [PDF.js](https://mozilla.github.io/pdf.js/): text extraction, link recovery,
  scanned-page detection).
- **Job extraction** — paste text directly, or fetch a public URL with a
  CORS-aware fetcher that asks you to paste instead when a site blocks browser
  access.
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

Helper scripts (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1    # dev server
powershell -ExecutionPolicy Bypass -File scripts/build.ps1  # static build
```

---

## Testing

The ported engines are covered by a [Vitest](https://vitest.dev/) suite
(`frontend/test/engines.test.js`) — text/date utilities, the skill dictionary,
`.tex` parsing, job structuring, both matching engines, hybrid reconciliation,
the suggestion/claim guards, and LaTeX rendering + validation.

```powershell
cd frontend
npm test          # run once
npm run test:watch
```

Run `npm test` and `npm run build` before committing.

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
| `jobExtractor.js` | Job text structuring + CORS-aware URL fetch |
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

- There is **no server** and no telemetry. Your files are never uploaded.
- Parsed resumes, jobs, analyses and versions live in **IndexedDB** in your
  browser, keyed by an anonymous local id.
- Local AI runs on your hardware; the only network request is the one-time model
  download from Hugging Face (skipped in lexical mode).
- Use **Export project** to save a JSON snapshot, **Import project** to restore
  it, and **Clear local data** to delete everything from the browser.

---

## Limitations (honest by design)

- Scores are AlignCV's estimates, not an ATS's.
- Browser CORS blocks many job URLs; paste the description in that case.
- The lexical semantic fallback estimates relatedness, not proof of experience.
- PDF resume parsing cannot recover the original LaTeX, so it reconstructs a
  clean editable representation.
- In-browser PDF compilation is not bundled; `.tex` export always works.

---

## Project structure

```
AlignCV/
├─ frontend/
│  ├─ src/
│  │  ├─ api/client.js        # local engine facade (keeps pages unchanged)
│  │  ├─ components/          # Layout, Stepper, MetricCard, ...
│  │  ├─ lib/                 # ported engines (see table above)
│  │  ├─ pages/               # Landing, Workspace, MatchReport, Editor, Export
│  │  ├─ state/session.jsx    # workflow state (localStorage)
│  │  └─ styles/              # SCSS
│  ├─ test/                   # Vitest suite + fixtures
│  ├─ index.html
│  └─ vite.config.js
├─ scripts/                   # dev.ps1 / build.ps1
├─ vercel.json
└─ README.md
```

---

## License

See [LICENSE](./LICENSE).
