import {
  Boxes,
  FileDown,
  FolderPlus,
  LayoutTemplate,
  Moon,
  RefreshCcw,
  Save,
  Sun,
  Magnet,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useDiagramController } from "./editor/useDiagramController";
import { SvgCanvas } from "./renderer/SvgCanvas";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { useThemeMode } from "./ui/useThemeMode";
import { downloadText } from "./utils/download";

export function App() {
  const controller = useDiagramController();
  const { theme, toggleTheme } = useThemeMode();
  const isDark = theme === "dark";
  const svgRef = useRef<SVGSVGElement | null>(null);

  const exportPdf = async () => {
    const { exportDiagramPdf } = await import("./utils/pdfExport");
    return exportDiagramPdf(svgRef.current);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        controller.redo();
        return;
      }

      if (key === "z") {
        event.preventDefault();
        controller.undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        controller.redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Boxes size={22} />
          <div>
            <h1>DBML Studio</h1>
            <span>{controller.diagram.tables.length} tabelas</span>
          </div>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => void controller.applyAutoLayout()}>
            <LayoutTemplate size={16} />
            Auto layout
          </button>
          <button
            type="button"
            className={controller.snapToGrid ? "is-toggle-active" : ""}
            onClick={() => controller.setSnapToGrid(!controller.snapToGrid)}
            title="Snap de linhas, tabelas e grupos no grid"
          >
            <Magnet size={16} />
            Snap
          </button>
          <button type="button" onClick={controller.undo} disabled={!controller.canUndo} title="Desfazer">
            <Undo2 size={16} />
            Desfazer
          </button>
          <button type="button" onClick={controller.redo} disabled={!controller.canRedo} title="Refazer">
            <Redo2 size={16} />
            Refazer
          </button>
          <button type="button" onClick={controller.addGroup}>
            <FolderPlus size={16} />
            Grupo
          </button>
          <button type="button" onClick={() => void controller.saveLayoutToEditor()}>
            <Save size={16} />
            Salvar layout
          </button>
          {controller.saveMessage && <span className="save-status">{controller.saveMessage}</span>}
          <button type="button" onClick={toggleTheme}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            {isDark ? "Claro" : "Escuro"}
          </button>
          <button type="button" onClick={() => void controller.loadDemo()}>
            <RefreshCcw size={16} />
            Demo
          </button>
          <button
            type="button"
            onClick={() => downloadText("diagram.dbml", controller.exportedDbml || controller.dbmlText)}
          >
            <FileDown size={16} />
            Exportar DBML
          </button>
          <button type="button" onClick={() => void exportPdf()}>
            <FileDown size={16} />
            Exportar PDF
          </button>
        </div>
      </header>
      <main className="workspace">
        <aside className={`dbml-pane${controller.dbmlError ? " has-error" : ""}`}>
          <div className="pane-heading">
            <h2>DBML</h2>
          </div>
          {controller.dbmlError && (
            <div className="dbml-error" role="status">
              {controller.dbmlError}
            </div>
          )}
          <textarea
            value={controller.dbmlText}
            onChange={(event) => controller.setDbmlText(event.target.value)}
            spellCheck={false}
          />
        </aside>
        <section className="canvas-pane">
          <SvgCanvas controller={controller} svgRef={svgRef} />
        </section>
        <PropertiesPanel controller={controller} />
      </main>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : undefined;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return element.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}
