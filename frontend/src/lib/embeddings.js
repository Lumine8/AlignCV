// Main-thread client for the embedding Web Worker. Exposes an embedder object
// compatible with the semantic engine ({ kind, encode, similarity }) so it can
// be passed straight into runSemantic().

function cosine(a, b) {
  let num = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    num += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? num / denom : 0;
}

export class EmbeddingClient {
  constructor() {
    this.kind = "transformer-embedding";
    this.model = "Xenova/all-MiniLM-L6-v2";
    this._worker = null;
    this._seq = 0;
    this._pending = new Map();
    this._progressHandlers = new Set();
  }

  _ensureWorker() {
    if (this._worker) return this._worker;
    this._worker = new Worker(new URL("./workers/embedding.worker.js", import.meta.url), { type: "module" });
    this._worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === "progress") {
        for (const handler of this._progressHandlers) handler(msg.progress);
        return;
      }
      const entry = this._pending.get(msg.id);
      if (!entry) return;
      this._pending.delete(msg.id);
      if (msg.type === "embedded" || msg.type === "ready") entry.resolve(msg.vectors || true);
      else entry.reject(new Error(msg.error || "Embedding worker error"));
    };
    this._worker.onerror = (err) => {
      for (const [, entry] of this._pending) entry.reject(new Error(err.message || "Embedding worker failed"));
      this._pending.clear();
    };
    return this._worker;
  }

  onProgress(handler) {
    this._progressHandlers.add(handler);
    return () => this._progressHandlers.delete(handler);
  }

  _request(payload) {
    const worker = this._ensureWorker();
    const id = (this._seq += 1);
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...payload });
    });
  }

  warmup() {
    return this._request({ type: "warmup" });
  }

  encode(texts) {
    if (!texts.length) return Promise.resolve([]);
    return this._request({ type: "embed", texts });
  }

  similarity(a, b) {
    return a && b && a.length === b.length ? cosine(a, b) : 0;
  }

  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._pending.clear();
  }
}

let sharedClient = null;

export function getEmbeddingClient() {
  if (!sharedClient) sharedClient = new EmbeddingClient();
  return sharedClient;
}
