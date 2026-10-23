// Persistence for the Create workflow:
// - the live working copy is autosaved to localStorage (cheap, synchronous);
// - explicit "Save to this browser" writes a resume record to IndexedDB using
//   the same `resumes` store the analysis workflow reads.

import { getAllByOwner, get, getClientId, put } from "../storage/db.js";
import { toEngineResume } from "./model.js";

const DRAFT_KEY = "aligncv.create.draft";

export function loadWorkingDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function saveWorkingDraft(document) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(document));
  } catch (_) {
    /* ignore quota errors */
  }
}

export function clearWorkingDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (_) {
    /* ignore */
  }
}

export async function saveCreatedResume(document) {
  const baseline = toEngineResume(document);
  const record = {
    id: document.id,
    owner_id: getClientId(),
    filename: baseline.filename,
    source_type: "created",
    baseline,
    structured: document,
    original_text: baseline.original_text,
    raw_tex: "",
    warnings: document.warnings || [],
    created_at: new Date().toISOString(),
  };
  await put("resumes", record);
  return record;
}

export async function listCreatedResumes() {
  const all = await getAllByOwner("resumes", getClientId());
  return all
    .filter((record) => record.source_type === "created")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function loadCreatedResume(id) {
  const record = await get("resumes", id);
  if (!record) return null;
  return record.structured || null;
}
