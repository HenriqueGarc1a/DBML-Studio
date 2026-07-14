import { ChevronLeft, ChevronRight, CircleHelp, Database, FileDown, History, Save } from "lucide-react";
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
import { DiagramHistoryDialog } from "../components/DiagramHistoryDialog";
import { DiagramExportDialog } from "../components/DiagramExportDialog";
import { DatabaseDialog } from "../components/DatabaseDialog";
import { ProjectHeader } from "../components/ProjectHeader";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [databaseOpen, setDatabaseOpen] = useState(false);

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
  const goToWiki = async () => {
    const preview = await captureDiagramPreview(svgRef.current, controller.diagram.tables).catch(() => undefined);
    await controller.saveLayoutToEditor(preview);
    navigate(`/editor/${encodeURIComponent(controller.activeDiagramId)}/wiki`);
  };
  return (
    <div className="app-shell">
      <ProjectHeader
        projectName={controller.diagramName}
        projectFilename={controller.diagramFilename}
        activeSection="diagram"
        onMenu={() => void goToMenu()}
        onSectionChange={(section) => { if (section === "wiki") void goToWiki(); }}
        actions={(
          <>
          <span className={`diagram-save-indicator is-${controller.saveStatus}`} title={controller.lastSavedAt ? `Última persistência: ${new Date(controller.lastSavedAt).toLocaleString()}` : undefined}>{saveStatusLabel(controller.saveStatus)}</span>
          <button type="button" onClick={() => void save()}><Save size={16} />Salvar</button>
          <button type="button" className="secondary-button" onClick={() => setHistoryOpen(true)}><History size={16} />Versões</button>
          <button type="button" className="secondary-button" onClick={() => setDatabaseOpen(true)}><Database size={16} />Comparar banco</button>
          <button type="button" onClick={() => setExportOpen(true)}><FileDown size={16} />Exportar</button>
          <button type="button" onClick={() => setHelpOpen(true)}><CircleHelp size={16} />Ajuda</button>
          </>
        )}
      />
      <main className={`workspace${dbmlCollapsed ? " is-dbml-collapsed" : ""}${propertiesCollapsed ? " is-properties-collapsed" : ""}`}>
        <aside className={`dbml-pane${controller.dbmlError ? " has-error" : ""}${!controller.dbmlError && controller.diagram.dbmlWarnings?.length ? " has-warning" : ""}${dbmlCollapsed ? " is-collapsed" : ""}`}>
          <div className="pane-heading"><h2>{!dbmlCollapsed && "DBML"}</h2><button type="button" className="pane-toggle icon-button" onClick={() => setDbmlCollapsed(!dbmlCollapsed)}>{dbmlCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div>
          {!dbmlCollapsed && controller.dbmlError && <div className="dbml-error" role="alert">{controller.dbmlError}</div>}
          {!dbmlCollapsed && !controller.dbmlError && Boolean(controller.diagram.dbmlWarnings?.length) && (
            <details className="dbml-warning" role="status">
              <summary>{controller.diagram.dbmlWarnings?.length} aviso{controller.diagram.dbmlWarnings?.length === 1 ? "" : "s"} de compatibilidade</summary>
              <ul>{controller.diagram.dbmlWarnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}
          {!dbmlCollapsed && <textarea value={controller.dbmlText} onChange={(event) => controller.setDbmlText(event.target.value)} spellCheck={false} />}
        </aside>
        <section className="canvas-pane"><SvgCanvas controller={controller} svgRef={svgRef} /></section>
        <PropertiesPanel controller={controller} collapsed={propertiesCollapsed} onToggle={() => setPropertiesCollapsed(!propertiesCollapsed)} />
      </main>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {historyOpen && <DiagramHistoryDialog snapshots={controller.snapshots.filter((item) => item.diagramId === controller.activeDiagramId)} onClose={() => setHistoryOpen(false)} onDelete={controller.deleteSnapshot} onRestore={async (id) => { const restored = await controller.restoreSnapshot(id); if (restored) { toast.success("Versão restaurada"); setHistoryOpen(false); } else toast.error("Não foi possível restaurar a versão"); return restored; }} />}
      {exportOpen && <DiagramExportDialog svg={svgRef.current} filename={controller.diagramFilename} dbml={controller.exportedDbml} tikz={controller.exportedTikz} onClose={() => setExportOpen(false)} onExported={(message) => toast.success(message)} />}
      {databaseOpen && <DatabaseDialog mode="sync" diagram={controller.diagram} onClose={() => setDatabaseOpen(false)} />}
    </div>
  );
}

function saveStatusLabel(status: DiagramController["saveStatus"]): string {
  if (status === "dirty") return "Alterações pendentes";
  if (status === "saving") return "Salvando…";
  if (status === "local") return "Salvo localmente";
  if (status === "error") return "Falha ao salvar";
  return "Salvo";
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
