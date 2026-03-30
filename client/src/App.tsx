import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import CopyLibrary from "./pages/CopyLibrary";
import AngleBank from "./pages/AngleBank";
import UploadHistory from "./pages/UploadHistory";
import FieldOptions from "./pages/FieldOptions";
import MetaSettings from "./pages/MetaSettings";
import NamingGuide from "./pages/NamingGuide";

export default function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/copy-library" element={<CopyLibrary />} />
          <Route path="/angle-bank" element={<AngleBank />} />
          <Route path="/history" element={<UploadHistory />} />
          <Route path="/field-options" element={<FieldOptions />} />
          <Route path="/settings" element={<MetaSettings />} />
          <Route path="/naming-guide" element={<NamingGuide />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}
