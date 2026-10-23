import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
import CreateResume from "./pages/CreateResume.jsx";
import Workspace from "./pages/Workspace.jsx";
import MatchReport from "./pages/MatchReport.jsx";
import Editor from "./pages/Editor.jsx";
import Export from "./pages/Export.jsx";
import { useSession } from "./state/session.jsx";

function RequireAnalysis({ children }) {
  const { session } = useSession();
  if (!session.analysisId) return <Navigate to="/workspace" replace />;
  return children;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <div className="page-transition" key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<CreateResume />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route
          path="/report"
          element={
            <RequireAnalysis>
              <MatchReport />
            </RequireAnalysis>
          }
        />
        <Route
          path="/editor"
          element={
            <RequireAnalysis>
              <Editor />
            </RequireAnalysis>
          }
        />
        <Route
          path="/export"
          element={
            <RequireAnalysis>
              <Export />
            </RequireAnalysis>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}
