import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDiagramController } from "./editor/useDiagramController";
import { SvgCanvas } from "./renderer/SvgCanvas";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { downloadText } from "./utils/download";

export function App() {
  const controller = useDiagramController();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dbmlCollapsed, setDbmlCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);

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
          <input
            className="diagram-name-input"
            value={controller.diagramName}
            onChange={(event) => controller.setDiagramName(event.target.value)}
            aria-label="Nome do diagrama"
            title="Nome do diagrama"
          />
          <select
            className="diagram-picker"
            value={controller.activeDiagramId}
            onChange={(event) => void controller.openDiagram(event.target.value)}
            aria-label="Abrir diagrama"
            title="Abrir diagrama"
          >
            {controller.diagrams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void controller.createDiagram()}>
            <Plus size={16} />
            Novo
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              if (window.confirm(`Excluir "${controller.diagramName}"?`)) {
                void controller.deleteDiagram();
              }
            }}
          >
            <Trash2 size={16} />
            Excluir
          </button>
          <button type="button" onClick={() => void controller.saveLayoutToEditor()}>
            <Save size={16} />
            Salvar
          </button>
          {controller.saveMessage && <span className="save-status">{controller.saveMessage}</span>}
          <button
            type="button"
            onClick={() => downloadText(`${fileSafeName(controller.diagramName)}.dbml`, controller.exportedDbml || controller.dbmlText)}
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
      <main className={`workspace${dbmlCollapsed ? " is-dbml-collapsed" : ""}${propertiesCollapsed ? " is-properties-collapsed" : ""}`}>
        <aside className={`dbml-pane${controller.dbmlError ? " has-error" : ""}${dbmlCollapsed ? " is-collapsed" : ""}`}>
          <div className="pane-heading">
            {!dbmlCollapsed && <h2>DBML</h2>}
            <button
              type="button"
              className="pane-toggle icon-button"
              onClick={() => setDbmlCollapsed((collapsed) => !collapsed)}
              aria-expanded={!dbmlCollapsed}
              aria-label={dbmlCollapsed ? "Mostrar DBML" : "Recolher DBML"}
              title={dbmlCollapsed ? "Mostrar DBML" : "Recolher DBML"}
            >
              {dbmlCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          {!dbmlCollapsed && controller.dbmlError && (
            <div className="dbml-error" role="status">
              {controller.dbmlError}
            </div>
          )}
          {!dbmlCollapsed && (
            <textarea
              value={controller.dbmlText}
              onChange={(event) => controller.setDbmlText(event.target.value)}
              spellCheck={false}
            />
          )}
        </aside>
        <section className="canvas-pane">
          <SvgCanvas controller={controller} svgRef={svgRef} />
        </section>
        <PropertiesPanel
          controller={controller}
          collapsed={propertiesCollapsed}
          onToggle={() => setPropertiesCollapsed((collapsed) => !collapsed)}
        />
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

function fileSafeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
}
