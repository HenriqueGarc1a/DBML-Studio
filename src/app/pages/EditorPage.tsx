import { ArrowLeft, Boxes, ChevronLeft, ChevronRight, CircleHelp, Database, FileDown, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { DiagramController } from "../../editor/useDiagramController";
import { SvgCanvas } from "../../renderer/SvgCanvas";
import { PropertiesPanel } from "../../ui/PropertiesPanel";
import { captureDiagramPreview } from "../../utils/diagramPreview";
import { downloadText } from "../../utils/download";
import { saveTextFile, type TextFileHandle } from "../../utils/fileSave";
import { safeGetItem, safeSetItem } from "../../utils/storage";
import { HelpDialog } from "../components/HelpDialog";

const DBML_COLLAPSED_STORAGE_KEY = "dbml-studio-dbml-collapsed";
const PROPERTIES_COLLAPSED_STORAGE_KEY = "dbml-studio-properties-collapsed";

export function EditorPage({ controller }: { controller: DiagramController }) {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileHandleRef = useRef<TextFileHandle>();
  const [dbmlCollapsed, setDbmlCollapsed] = useStoredBoolean(DBML_COLLAPSED_STORAGE_KEY, false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useStoredBoolean(PROPERTIES_COLLAPSED_STORAGE_KEY, false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (diagramId && decodeURIComponent(diagramId) !== controller.activeDiagramId) {
      void controller.openDiagram(decodeURIComponent(diagramId));
    }
  }, [controller, diagramId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); event.shiftKey ? controller.redo() : controller.undo(); }
      if (key === "y") { event.preventDefault(); controller.redo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);

  useEffect(() => {
    if (controller.saveMessage.startsWith("Auto-layout:")) toast.success(controller.saveMessage);
  }, [controller.saveMessage]);

  const save = async () => {
    const preview = await captureDiagramPreview(svgRef.current, controller.diagram.tables).catch(() => undefined);
    const dbml = await controller.saveLayoutToEditor(preview);
    try {
      const result = await saveTextFile(controller.diagramFilename, dbml, fileHandleRef.current);
      fileHandleRef.current = result.handle ?? fileHandleRef.current;
      toast.success("Esquema salvo");
    } catch {
      downloadText(controller.diagramFilename, dbml);
      toast.warning("Arquivo baixado porque o salvamento direto não estava disponível");
    }
  };
  const goToMenu = async () => {
    const preview = await captureDiagramPreview(svgRef.current, controller.diagram.tables).catch(() => undefined);
    await controller.saveLayoutToEditor(preview);
    navigate("/");
  };
  const exportPdf = async () => {
    const { exportDiagramPdf } = await import("../../utils/pdfExport");
    await exportDiagramPdf(svgRef.current);
    toast.success("PDF exportado");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="secondary-button menu-back-button" onClick={() => void goToMenu()}><ArrowLeft size={16} />Menu</button>
        <div className="brand"><Boxes size={22} /><h1>DBML Studio</h1></div>
        <div className="active-diagram-name" title={controller.diagramFilename}><Database size={15} /><span>{controller.diagramName}</span></div>
        <div className="toolbar">
          <button type="button" onClick={() => void save()}><Save size={16} />Salvar</button>
          <button type="button" onClick={() => void exportPdf()}><FileDown size={16} />Exportar PDF</button>
          <button type="button" onClick={() => setHelpOpen(true)}><CircleHelp size={16} />Ajuda</button>
        </div>
      </header>
      <main className={`workspace${dbmlCollapsed ? " is-dbml-collapsed" : ""}${propertiesCollapsed ? " is-properties-collapsed" : ""}`}>
        <aside className={`dbml-pane${controller.dbmlError ? " has-error" : ""}${dbmlCollapsed ? " is-collapsed" : ""}`}>
          <div className="pane-heading"><h2>{!dbmlCollapsed && "DBML"}</h2><button type="button" className="pane-toggle icon-button" onClick={() => setDbmlCollapsed(!dbmlCollapsed)}>{dbmlCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div>
          {!dbmlCollapsed && controller.dbmlError && <div className="dbml-error">{controller.dbmlError}</div>}
          {!dbmlCollapsed && <textarea value={controller.dbmlText} onChange={(event) => controller.setDbmlText(event.target.value)} spellCheck={false} />}
        </aside>
        <section className="canvas-pane"><SvgCanvas controller={controller} svgRef={svgRef} /></section>
        <PropertiesPanel controller={controller} collapsed={propertiesCollapsed} onToggle={() => setPropertiesCollapsed(!propertiesCollapsed)} />
      </main>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function useStoredBoolean(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => safeGetItem(key) === null ? fallback : safeGetItem(key) === "true");
  useEffect(() => { safeSetItem(key, String(value)); }, [key, value]);
  return [value, setValue];
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : undefined;
  return Boolean(element && (element.isContentEditable || ["input", "textarea", "select"].includes(element.tagName.toLowerCase())));
}
