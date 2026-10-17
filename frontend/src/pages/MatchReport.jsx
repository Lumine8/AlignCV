import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";
import MetricCard from "../components/MetricCard.jsx";
import RequirementCard from "../components/RequirementCard.jsx";
import Stepper from "../components/Stepper.jsx";
import { useSession } from "../state/session.jsx";

const FILTERS = ["all", "matched", "partial", "missing", "uncertain", "conflict"];

export default function MatchReport() {
  const { session, update } = useSession();
  const [analysis, setAnalysis] = useState(session.analysis);
  const [loading, setLoading] = useState(!session.analysis);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (session.analysis || !session.analysisId) return;
    setLoading(true);
    api
      .getAnalysis(session.analysisId)
      .then((res) => {
        setAnalysis(res.result);
        update({ analysis: res.result });
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [session.analysis, session.analysisId, update]);

  const matches = analysis?.matches || [];
  const filtered = useMemo(
    () => (filter === "all" ? matches : matches.filter((m) => m.status === filter)),
    [matches, filter]
  );
  const counts = useMemo(() => {
    const c = { all: matches.length };
    for (const m of matches) c[m.status] = (c[m.status] || 0) + 1;
    return c;
  }, [matches]);

  if (loading) return <Loading label="Loading analysis…" />;
  if (error) return <ErrorBanner error={error} />;
  if (!analysis) return <ErrorBanner error="No analysis is loaded. Start from the workspace." />;

  const metrics = analysis.metrics;

  return (
    <>
      <Stepper completed={["workspace", "report"]} />
      <h1>Match report</h1>
      <p className="muted">
        {analysis.scoring_config?.weights
          ? `Hybrid weights - traditional ${analysis.scoring_config.weights.traditional}, semantic ${analysis.scoring_config.weights.semantic}. `
          : ""}
        These are AlignCV's estimates, kept separate on purpose.
      </p>

      <div className="grid grid--metrics section-gap">
        <MetricCard
          label="Traditional match"
          value={metrics.traditional_score}
          suffix="%"
          bar={metrics.traditional_score}
          sub="Exact + alias + rules"
        />
        <MetricCard
          label="Semantic match"
          value={metrics.semantic_score}
          suffix="%"
          bar={metrics.semantic_score}
          sub={`Engine: ${analysis.reconciliation?.semantic_backend || "n/a"}`}
        />
        <MetricCard
          label="Hybrid match"
          value={metrics.hybrid_score}
          suffix="%"
          bar={metrics.hybrid_score}
          accent
          sub="Combined estimate"
        />
        <MetricCard
          label="Resume parseability"
          value={metrics.parseability_score}
          suffix="%"
          bar={metrics.parseability_score}
          sub="Structural completeness"
        />
        <MetricCard
          label="Evidence confidence"
          value={Math.round((metrics.evidence_confidence || 0) * 100)}
          suffix="%"
          bar={(metrics.evidence_confidence || 0) * 100}
          sub="Strength of cited evidence"
        />
      </div>

      {analysis.warnings?.length > 0 && (
        <div className="banner banner--warning section-gap">
          <div>
            <strong>Reconciliation warnings</strong>
            <ul>
              {analysis.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {analysis.hard_requirements?.length > 0 && (
        <div className="card section-gap">
          <h2>Hard requirements</h2>
          <p className="tiny muted">
            These are reported independently of the aggregate score - a high hybrid score does not
            override a missing must-have.
          </p>
          <div className="stack">
            {analysis.hard_requirements.map((m) => (
              <RequirementCard key={m.requirement_id} match={m} />
            ))}
          </div>
        </div>
      )}

      {analysis.engine_disagreements?.length > 0 && (
        <div className="card section-gap">
          <h2>Where the engines disagree</h2>
          <div className="stack">
            {analysis.engine_disagreements.map((d) => (
              <div className="banner banner--info" key={d.requirement_id}>
                <div>
                  <strong>{d.requirement}</strong>
                  <div className="tiny" style={{ marginTop: 4 }}>
                    Traditional: {d.traditional_status} ({Math.round(d.traditional_score * 100)}%) ·
                    Semantic: {d.semantic_status} ({Math.round(d.semantic_score * 100)}%)
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {d.resolution}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.clarification_questions?.length > 0 && (
        <div className="card section-gap">
          <h2>Questions AlignCV won't answer for you</h2>
          <p className="tiny muted">
            AlignCV never fabricates. If something is missing, it asks instead of inventing it.
          </p>
          <ul className="muted">
            {analysis.clarification_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card section-gap">
        <div className="card__title">
          <h2 style={{ margin: 0 }}>Requirement-by-requirement</h2>
          <span className="tiny dim">
            {analysis.reconciliation?.disagreement_count || 0} disagreement(s)
          </span>
        </div>
        <div className="row" style={{ marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`btn btn--sm ${filter === f ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setFilter(f)}
            >
              {f} {counts[f] ? `(${counts[f]})` : ""}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="muted">No requirements in this category.</p>
        ) : (
          <div className="stack">
            {filtered.map((m) => (
              <RequirementCard key={m.requirement_id} match={m} />
            ))}
          </div>
        )}
      </div>

      <div className="row section-gap">
        <Link to="/editor" className="btn btn--primary">
          Review suggested changes →
        </Link>
        <Link to="/workspace" className="btn btn--ghost">
          Adjust inputs
        </Link>
      </div>
    </>
  );
}
