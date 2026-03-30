import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import UploadHistory from "./pages/UploadHistory";
import MetaSettings from "./pages/MetaSettings";
import NamingConfig from "./pages/NamingConfig";

export default function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/history" element={<UploadHistory />} />
          <Route path="/naming-config" element={<NamingConfig />} />
          <Route path="/settings" element={<MetaSettings />} />
          {/* Legacy redirects */}
          <Route path="/copy-library" element={<Navigate to="/naming-config" replace />} />
          <Route path="/angle-bank" element={<Navigate to="/naming-config" replace />} />
          <Route path="/field-options" element={<Navigate to="/naming-config" replace />} />
          <Route path="/naming-guide" element={<Navigate to="/naming-config" replace />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}
