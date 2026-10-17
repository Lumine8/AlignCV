// Optional in-browser LaTeX-to-PDF compilation.
//
// Reliable, full-featured LaTeX toolchains are large and are not bundled by
// default. AlignCV therefore treats PDF compilation as optional: when no engine
// is registered we return a clear, honest result and the UI offers the .tex
// download plus Overleaf instructions instead. A host can plug in a WASM engine
// by assigning `window.ALIGNCV_LATEX_ENGINE` (see README) before compiling.

const ENGINE_KEY = "ALIGNCV_LATEX_ENGINE";

export function latexEngineAvailable() {
  return typeof window !== "undefined" && typeof window[ENGINE_KEY] === "function";
}

export async function compileToPdf(tex) {
  if (!latexEngineAvailable()) {
    return {
      available: false,
      ran: false,
      ok: false,
      pdfBytes: null,
      logs: "",
      error:
        "In-browser PDF compilation is not enabled. Download the .tex source and compile it on Overleaf (or locally with a LaTeX distribution).",
    };
  }
  try {
    const result = await window[ENGINE_KEY](tex);
    const pdfBytes = result && result.pdf ? result.pdf : null;
    return {
      available: true,
      ran: true,
      ok: Boolean(pdfBytes),
      pdfBytes,
      logs: (result && result.logs) || "",
      error: pdfBytes ? "" : "The LaTeX engine returned no PDF output.",
    };
  } catch (err) {
    return {
      available: true,
      ran: true,
      ok: false,
      pdfBytes: null,
      logs: "",
      error: err && err.message ? err.message : "LaTeX compilation failed.",
    };
  }
}
