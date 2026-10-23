import { Link, NavLink } from "react-router-dom";
import { useSession } from "../state/session.jsx";

export default function Layout({ children }) {
  const { session, reset } = useSession();
  const hasAnalysis = Boolean(session.analysisId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar__inner">
          <Link to="/" className="topbar__brand">
            <span className="topbar__logo">AC</span>
            <span>
              AlignCV <span className="topbar__tag">/ resume intelligence</span>
            </span>
          </Link>
          <nav className="topbar__nav">
            <NavLink to="/create" className={({ isActive }) => (isActive ? "active" : "")}>
              Create
            </NavLink>
            <NavLink to="/workspace" className={({ isActive }) => (isActive ? "active" : "")}>
              Workspace
            </NavLink>
            {hasAnalysis && (
              <>
                <NavLink to="/report" className={({ isActive }) => (isActive ? "active" : "")}>
                  Report
                </NavLink>
                <NavLink to="/editor" className={({ isActive }) => (isActive ? "active" : "")}>
                  Editor
                </NavLink>
                <NavLink to="/export" className={({ isActive }) => (isActive ? "active" : "")}>
                  Export
                </NavLink>
                <button className="btn btn--ghost btn--sm" onClick={reset} type="button">
                  New
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container" style={{ flex: 1, paddingTop: 8, paddingBottom: 40 }}>
        {children}
      </main>

      <footer className="footer">
        <div className="container">
          AlignCV provides its own match estimates - not any employer's ATS score and not a
          probability of an interview. Suggestions are only ever reordered or re-emphasized from
          your existing resume; AlignCV never invents experience.
        </div>
      </footer>
    </div>
  );
}
