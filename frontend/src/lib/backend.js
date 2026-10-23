// Optional FastAPI backend client. The app remains fully usable offline: these
// helpers are only called when VITE_API_BASE_URL is configured at build time.

const rawBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
export const API_BASE_URL = rawBase.trim().replace(/\/+$/, "");
export const backendConfigured = Boolean(API_BASE_URL);

async function post(path, body, timeoutMs = 60000) {
  if (!backendConfigured) {
    throw new Error("The optional backend is not configured (VITE_API_BASE_URL is empty).");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("The backend request timed out.");
    }
    throw new Error("Could not reach the backend. Check that it is running and CORS allows this origin.");
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && payload.error && payload.error.message) ||
      `The backend returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.code = payload && payload.error && payload.error.code;
    error.details = payload && payload.error && payload.error.details;
    throw error;
  }
  return payload;
}

async function postForm(path, formData, timeoutMs = 60000) {
  if (!backendConfigured) {
    throw new Error("The optional backend is not configured (VITE_API_BASE_URL is empty).");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("The backend request timed out.");
    }
    throw new Error("Could not reach the backend. Check that it is running and CORS allows this origin.");
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && payload.error && payload.error.message) ||
      `The backend returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.code = payload && payload.error && payload.error.code;
    error.details = payload && payload.error && payload.error.details;
    throw error;
  }
  return payload;
}

export function parseResumeRemote(file) {
  const form = new FormData();
  form.append("file", file, file && file.name ? file.name : "resume");
  return postForm("/api/resumes/parse", form, 60000);
}

export function extractJobRemote(payload) {
  return post("/api/jobs/extract", payload, 60000);
}

export function renderLatexRemote(document, template) {
  return post("/api/latex/render", { document, template: template || null });
}

export function compileLatexRemote({ document = null, source = null, template = null }) {
  return post("/api/latex/compile", { document, source, template }, 90000);
}
