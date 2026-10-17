import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
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

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
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
    </Layout>
  );
}
