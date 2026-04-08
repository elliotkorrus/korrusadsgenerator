import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import Home from "./pages/Home";
import UploadHistory from "./pages/UploadHistory";
import MetaSettings from "./pages/MetaSettings";
import NamingConfig from "./pages/NamingConfig";
import HandleBank from "./pages/HandleBank";
import Login from "./pages/Login";

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("app-token"));

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <ErrorBoundary>
    <ToastProvider>
      <BrowserRouter>
        <DashboardLayout onSignOut={() => { localStorage.removeItem("app-token"); setAuthed(false); }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<UploadHistory />} />
            <Route path="/naming-config" element={<NamingConfig />} />
            <Route path="/handles" element={<HandleBank />} />
            <Route path="/settings" element={<MetaSettings />} />
            {/* Legacy redirects */}
            <Route path="/copy-library" element={<Navigate to="/naming-config" replace />} />
            <Route path="/angle-bank" element={<Navigate to="/naming-config" replace />} />
            <Route path="/field-options" element={<Navigate to="/naming-config" replace />} />
            <Route path="/naming-guide" element={<Navigate to="/naming-config" replace />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  );
}
