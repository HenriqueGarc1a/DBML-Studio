import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FileDown,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDiagramController } from "./editor/useDiagramController";
import { SvgCanvas } from "./renderer/SvgCanvas";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { downloadText } from "./utils/download";
import { saveTextFile, type TextFileHandle } from "./utils/fileSave";

const DBML_COLLAPSED_STORAGE_KEY = "dbml-studio-dbml-collapsed";
const PROPERTIES_COLLAPSED_STORAGE_KEY = "dbml-studio-properties-collapsed";

export function App() {
  const controller = useDiagramController();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dbmlFileHandleRef = useRef<TextFileHandle | undefined>();
  const [dbmlCollapsed, setDbmlCollapsed] = useState(() => readStoredBoolean(DBML_COLLAPSED_STORAGE_KEY, false));
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() =>
    readStoredBoolean(PROPERTIES_COLLAPSED_STORAGE_KEY, false),
  );
  const [sqlImportOpen, setSqlImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sqlDraft, setSqlDraft] = useState("");
  const [sqlImportError, setSqlImportError] = useState("");

  const exportPdf = async () => {
    const { exportDiagramPdf } = await import("./utils/pdfExport");
    return exportDiagramPdf(svgRef.current);
  };

  const saveDiagram = async () => {
    const dbml = await controller.saveLayoutToEditor();
    try {
      const result = await saveTextFile(controller.diagramFilename, dbml, dbmlFileHandleRef.current);
      dbmlFileHandleRef.current = result.handle ?? dbmlFileHandleRef.current;
    } catch (error) {
      console.error("Could not save DBML file.", error);
      downloadText(controller.diagramFilename, dbml);
    }
  };

  const importSql = async () => {
    setSqlImportError("");
    try {
      await controller.createDiagramFromSql(sqlDraft);
      setSqlImportOpen(false);
      setSqlDraft("");
    } catch (error) {
      setSqlImportError(error instanceof Error ? error.message : "Não foi possível traduzir o SQL.");
    }
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

  useEffect(() => {
    writeStoredBoolean(DBML_COLLAPSED_STORAGE_KEY, dbmlCollapsed);
  }, [dbmlCollapsed]);

  useEffect(() => {
    writeStoredBoolean(PROPERTIES_COLLAPSED_STORAGE_KEY, propertiesCollapsed);
  }, [propertiesCollapsed]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Boxes size={22} />
          <div>
            <h1>DBML Studio</h1>
            <span>
              {controller.diagram.tables.length} tabelas · {controller.diagram.relations.length} linhas
            </span>
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
          <button type="button" onClick={() => setSqlImportOpen(true)}>
            <Database size={16} />
            SQL
          </button>
          <button type="button" onClick={() => void saveDiagram()}>
            <Save size={16} />
            Salvar
          </button>
          <button type="button" onClick={() => void exportPdf()}>
            <FileDown size={16} />
            Exportar PDF
          </button>
          <button type="button" onClick={() => setHelpOpen(true)} title="Abrir tutorial">
            <CircleHelp size={16} />
            Ajuda
          </button>
          {(controller.saveMessage || controller.dbmlError) && (
            <span className={`toolbar-status${controller.dbmlError ? " is-error" : ""}`} role="status">
              {controller.dbmlError ? "DBML precisa de ajuste" : controller.saveMessage}
            </span>
          )}
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
      {sqlImportOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSqlImportOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sql-import-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="sql-import-title">Novo esquema via SQL</h2>
              <button type="button" className="icon-button" title="Fechar" onClick={() => setSqlImportOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {sqlImportError && (
              <div className="modal-error" role="status">
                {sqlImportError}
              </div>
            )}
            <textarea
              className="sql-import-textarea"
              value={sqlDraft}
              onChange={(event) => setSqlDraft(event.target.value)}
              spellCheck={false}
              autoFocus
              placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);`}
            />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSqlImportOpen(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void importSql()} disabled={!sqlDraft.trim()}>
                <Database size={16} />
                Criar esquema
              </button>
            </div>
          </section>
        </div>
      )}
      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section
            className="modal-panel help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="help-title">Tutorial do DBML Studio</h2>
              <button type="button" className="icon-button" title="Fechar" onClick={() => setHelpOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="help-content">
              <section className="help-section">
                <h3>Visão geral</h3>
                <p>
                  O DBML Studio transforma DBML ou SQL em um diagrama editável. O painel esquerdo guarda o
                  texto DBML, o centro mostra o canvas e o painel direito edita o item selecionado.
                </p>
              </section>
              <section className="help-section">
                <h3>Criar e editar</h3>
                <ol>
                  <li>Use Nova tabela no toolbar flutuante para adicionar uma tabela.</li>
                  <li>Selecione a tabela e adicione campos no grupo Campos.</li>
                  <li>Ative Nova relação e clique no campo de origem e depois no campo de destino.</li>
                  <li>Selecione uma linha para mudar cor, espessura, cardinalidade e rota.</li>
                </ol>
              </section>
              <section className="help-section">
                <h3>Linhas e pontos</h3>
                <p>
                  Pontos são dobras manuais da linha. Se todos forem removidos, a linha continua existindo,
                  salva e selecionável; ela volta para uma rota automática entre os dois campos.
                </p>
              </section>
              <section className="help-section">
                <h3>Salvar e carregar</h3>
                <p>
                  Salvar grava o DBML atual em arquivo. O seletor no topo abre outros diagramas salvos, e o app
                  também faz autosave local enquanto você trabalha.
                </p>
              </section>
              <section className="help-section">
                <h3>Dicas rápidas</h3>
                <ul>
                  <li>Dê duplo clique em uma linha para inserir um ponto intermediário.</li>
                  <li>Use Auto rota para reorganizar uma linha sem apagar a relação.</li>
                  <li>Quando nada estiver selecionado, o painel direito mostra a lista de linhas do diagrama.</li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : undefined;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return element.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }

  return fallback;
}

function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}
