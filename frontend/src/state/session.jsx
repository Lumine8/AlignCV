import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Lightweight session state shared across the workflow screens. Persisted to
// localStorage so a refresh does not lose the current analysis.
const SessionContext = createContext(null);

const STORAGE_KEY = "aligncv.session";

const initialState = {
  resumeId: null,
  resume: null,
  jobId: null,
  job: null,
  analysisId: null,
  analysis: null,
  versionId: null,
  texSource: "",
  decisions: {},
};

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initialState, ...JSON.parse(raw) };
  } catch (_) {
    /* ignore */
  }
  return initialState;
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (_) {
      /* ignore quota errors */
    }
  }, [session]);

  const update = useCallback((patch) => {
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSession(initialState), []);

  const setDecision = useCallback((suggestionId, decision) => {
    setSession((prev) => ({
      ...prev,
      decisions: { ...prev.decisions, [suggestionId]: { ...prev.decisions[suggestionId], ...decision } },
    }));
  }, []);

  const value = useMemo(() => ({ session, update, reset, setDecision }), [session, update, reset, setDecision]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
