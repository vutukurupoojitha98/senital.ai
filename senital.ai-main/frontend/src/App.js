import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";

import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/components/AppLayout";
import OverviewPage from "@/pages/OverviewPage";
import ServicesPage from "@/pages/ServicesPage";
import IncidentsPage from "@/pages/IncidentsPage";
import IncidentDetailPage from "@/pages/IncidentDetailPage";
import KafkaPage from "@/pages/KafkaPage";
import KubernetesPage from "@/pages/KubernetesPage";
import DatabasePage from "@/pages/DatabasePage";
import DeploymentsPage from "@/pages/DeploymentsPage";
import TracingPage from "@/pages/TracingPage";
import CopilotPage from "@/pages/CopilotPage";
import TimelinePage from "@/pages/TimelinePage";
import NotificationsPage from "@/pages/NotificationsPage";
import AdminPage from "@/pages/AdminPage";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm font-mono" style={{ background: "var(--bg)" }}>
        Initializing Sentinel AI…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#1e1e22",
                border: "1px solid #2a2a30",
                color: "#f5f5f7",
                fontFamily: "IBM Plex Mono",
                fontSize: 12,
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Protected><OverviewPage /></Protected>} />
            <Route path="/services" element={<Protected><ServicesPage /></Protected>} />
            <Route path="/incidents" element={<Protected><IncidentsPage /></Protected>} />
            <Route path="/incidents/:id" element={<Protected><IncidentDetailPage /></Protected>} />
            <Route path="/kafka" element={<Protected><KafkaPage /></Protected>} />
            <Route path="/kubernetes" element={<Protected><KubernetesPage /></Protected>} />
            <Route path="/database" element={<Protected><DatabasePage /></Protected>} />
            <Route path="/deployments" element={<Protected><DeploymentsPage /></Protected>} />
            <Route path="/tracing" element={<Protected><TracingPage /></Protected>} />
            <Route path="/copilot" element={<Protected><CopilotPage /></Protected>} />
            <Route path="/timeline" element={<Protected><TimelinePage /></Protected>} />
            <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
            <Route path="/admin" element={<Protected roles={["ADMIN"]}><AdminPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
