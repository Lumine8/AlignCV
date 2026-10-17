// Web Worker that runs Transformers.js embeddings off the main thread.
// The model is downloaded from Hugging Face on first use and cached by the
// browser. Failure here is non-fatal: the app falls back to lexical matching.

let extractorPromise = null;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function getExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then(({ pipeline, env }) => {
      env.allowLocalModels = false;
      return pipeline("feature-extraction", MODEL_ID, { progress_callback: onProgress });
    });
  }
  return extractorPromise;
}

self.onmessage = async (event) => {
  const { id, type, texts } = event.data || {};
  if (type === "warmup") {
    try {
      await getExtractor((p) => self.postMessage({ type: "progress", id, progress: p }));
      self.postMessage({ type: "ready", id });
    } catch (err) {
      self.postMessage({ type: "error", id, error: err && err.message ? err.message : String(err) });
    }
    return;
  }

  if (type === "embed") {
    try {
      const extractor = await getExtractor();
      const output = await extractor(texts, { pooling: "mean", normalize: true });
      const dim = output.dims[output.dims.length - 1];
      const flat = Array.from(output.data);
      const vectors = [];
      for (let i = 0; i < flat.length; i += dim) vectors.push(flat.slice(i, i + dim));
      self.postMessage({ type: "embedded", id, vectors });
    } catch (err) {
      self.postMessage({ type: "error", id, error: err && err.message ? err.message : String(err) });
    }
  }
};
