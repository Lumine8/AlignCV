// Local API facade. The app is 100% client-side, so this module simply forwards
// to the in-browser engine (parsing, matching, optimization, LaTeX) which
// persists data in IndexedDB. It exposes only the operations the UI uses.

import { engine } from "../lib/engine.js";
import { getClientId } from "../lib/storage/db.js";

export const api = {
  getClientId,
  health: () => engine.health(),
  setSemanticMode: (mode) => engine.setSemanticMode(mode),
  warmupSemantic: (onProgress) => engine.warmupSemantic(onProgress),

  parseResume: (file) => engine.parseResume(file),
  compileResume: (payload) => engine.compileResume(payload),

  extractJobUrl: (url) => engine.extractJobUrl(url),
  extractJobText: (text, title = "", company = "") => engine.extractJobText(text, title, company),

  createAnalysis: (resumeId, jobId, weights) => engine.createAnalysis(resumeId, jobId, weights),
  getAnalysis: (id) => engine.getAnalysis(id),
  applyChanges: (id, decisions, label = "Optimized") => engine.applyChanges(id, decisions, label),

  exportProject: () => engine.exportProject(),
  importProject: (payload) => engine.importProject(payload),
  clearAllData: () => engine.clearAllData(),
};

export function downloadArtifact(artifactId, filename) {
  return engine.downloadArtifact(artifactId, filename);
}
