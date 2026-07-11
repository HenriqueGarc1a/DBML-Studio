import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { LibraryPage } from "./app/pages/LibraryPage";
import { EditorPage } from "./app/pages/EditorPage";
import { WikiPage } from "./app/pages/WikiPage";
import { useDiagramController } from "./editor/useDiagramController";

export function App() {
  const controller = useDiagramController();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage controller={controller} />} />
        <Route path="/editor/:diagramId" element={<EditorPage controller={controller} />} />
        <Route path="/editor/:diagramId/wiki" element={<WikiPage controller={controller} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster theme="dark" richColors position="bottom-right" closeButton />
    </BrowserRouter>
  );
}
