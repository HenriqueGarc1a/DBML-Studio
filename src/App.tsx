import {
  Boxes,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  FileDown,
  Plus,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDiagramController } from "./editor/useDiagramController";
import { SvgCanvas } from "./renderer/SvgCanvas";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { downloadText } from "./utils/download";
import { saveTextFile, type TextFileHandle } from "./utils/fileSave";
import { safeGetItem, safeSetItem } from "./utils/storage";
import { parseDbml } from "./parser/dbmlParser";
import { applyUiLayout } from "./exporter/uiLayoutFile";
import { getRelationGeometry } from "./utils/geometry";
import { captureDiagramPreview } from "./utils/diagramPreview";

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
  const [screen, setScreen] = useState<"library" | "editor">("library");
  const [editingDiagramId, setEditingDiagramId] = useState<string | undefined>();
  const [diagramNameDraft, setDiagramNameDraft] = useState("");

  const exportPdf = async () => {
    const { exportDiagramPdf } = await import("./utils/pdfExport");
    return exportDiagramPdf(svgRef.current);
  };

  const saveDiagram = async () => {
    const preview = await captureDiagramPreview(svgRef.current, controller.diagram.tables).catch(() => undefined);
    const dbml = await controller.saveLayoutToEditor(preview);
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
      setScreen("editor");
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

  if (screen === "library") {
    return (
      <div className="diagram-library-screen">
        <header className="library-screen-header">
          <div className="brand">
            <Boxes size={24} />
            <div>
              <h1>DBML Studio</h1>
              <span>Escolha um esquema para continuar</span>
            </div>
          </div>
          <div className="library-header-actions">
            <button type="button" className="secondary-button" onClick={() => setSqlImportOpen(true)}>
              <Database size={16} />
              Importar SQL
            </button>
            <button
              type="button"
              onClick={() => void controller.createDiagram().then(() => setScreen("editor"))}
            >
              <Plus size={16} />
              Novo esquema
            </button>
          </div>
        </header>
        <main className="diagram-library-home">
          <div className="library-home-heading">
            <div>
              <h2>Seus esquemas</h2>
              <p>{controller.diagrams.length} arquivo{controller.diagrams.length === 1 ? "" : "s"} disponível{controller.diagrams.length === 1 ? "" : "is"}</p>
            </div>
          </div>
          <div className="diagram-card-grid">
            {controller.diagrams.map((item) => (
              <article key={item.id} className="diagram-card">
                <button type="button" className="diagram-card-open" onClick={() => void controller.openDiagram(item.id).then(() => setScreen("editor"))}>
                  <DiagramPreview dbml={item.dbml} uiLayout={item.uiLayout} previewDataUrl={item.previewDataUrl} />
                  <span className="diagram-card-copy">
                    <strong>{item.name}</strong>
                    <small>{item.filename ?? `${item.name}.dbml`}</small>
                  </span>
                  <span className="diagram-card-action">Abrir</span>
                </button>
                <button
                  type="button"
                  className="diagram-card-edit icon-button"
                  title="Editar esquema"
                  aria-label={`Editar ${item.name}`}
                  onClick={() => {
                    setEditingDiagramId(item.id);
                    setDiagramNameDraft(item.name);
                  }}
                ><Pencil size={14} /></button>
              </article>
            ))}
          </div>
        </main>
        {sqlImportOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setSqlImportOpen(false)}>
            <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="sql-library-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-heading">
                <h2 id="sql-library-title">Novo esquema via SQL</h2>
                <button type="button" className="icon-button" title="Fechar" onClick={() => setSqlImportOpen(false)}><X size={16} /></button>
              </div>
              {sqlImportError && <div className="modal-error" role="status">{sqlImportError}</div>}
              <textarea className="sql-import-textarea" value={sqlDraft} onChange={(event) => setSqlDraft(event.target.value)} spellCheck={false} autoFocus placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY\n);`} />
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setSqlImportOpen(false)}>Cancelar</button>
                <button type="button" onClick={() => void importSql()} disabled={!sqlDraft.trim()}><Database size={16} />Criar esquema</button>
              </div>
            </section>
          </div>
        )}
        {editingDiagramId && (() => {
          const item = controller.diagrams.find((diagram) => diagram.id === editingDiagramId);
          if (!item) return null;
          return (
            <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingDiagramId(undefined)}>
              <section className="modal-panel diagram-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-diagram-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="modal-heading">
                  <h2 id="edit-diagram-title">Editar esquema</h2>
                  <button type="button" className="icon-button" title="Fechar" onClick={() => setEditingDiagramId(undefined)}><X size={16} /></button>
                </div>
                <div className="diagram-edit-body">
                  <label><span>Nome</span><input value={diagramNameDraft} onChange={(event) => setDiagramNameDraft(event.target.value)} autoFocus /></label>
                  <small>{item.filename}</small>
                </div>
                <div className="modal-actions diagram-edit-actions">
                  <button
                    type="button"
                    className="secondary-button danger-action"
                    disabled={controller.diagrams.length <= 1}
                    title={controller.diagrams.length <= 1 ? "Não é possível excluir o único esquema" : "Excluir esquema"}
                    onClick={() => {
                      if (window.confirm(`Excluir o esquema "${item.name}"?`)) {
                        void controller.deleteDiagram(item.id).then((deleted) => deleted && setEditingDiagramId(undefined));
                      }
                    }}
                  ><Trash2 size={15} />Excluir</button>
                  <button type="button" className="secondary-button" onClick={() => setEditingDiagramId(undefined)}>Cancelar</button>
                  <button
                    type="button"
                    disabled={!diagramNameDraft.trim()}
                    onClick={() => void controller.renameSavedDiagram(item.id, diagramNameDraft).then((renamed) => renamed && setEditingDiagramId(undefined))}
                  >Salvar</button>
                </div>
              </section>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="secondary-button menu-back-button"
          onClick={() => void captureDiagramPreview(svgRef.current, controller.diagram.tables)
            .catch(() => undefined)
            .then((preview) => controller.saveLayoutToEditor(preview))
            .then(() => setScreen("library"))}
          title="Voltar ao menu"
        >
          <ArrowLeft size={16} />
          Menu
        </button>
        <div className="brand">
          <Boxes size={22} />
          <div>
            <h1>DBML Studio</h1>
          </div>
        </div>
        <div className="active-diagram-name" title={controller.diagramFilename}>
          <Database size={15} />
          <span>{controller.diagramName}</span>
        </div>
        <div className="toolbar">
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
                  <li>Ative Nova relação, clique primeiro no campo da tabela pai e depois no campo FK da tabela filha.</li>
                  <li>Selecione uma linha para mudar cor, espessura, cardinalidade e rota.</li>
                </ol>
              </section>
              <section className="help-section">
                <h3>Editar linhas</h3>
                <p>
                  Ao selecionar uma linha, círculos movem trechos retos e losangos reposicionam curvas. A rota
                  nunca atravessa tabelas nem cruza a si mesma.
                </p>
              </section>
              <section className="help-section">
                <h3>Salvar e carregar</h3>
                <p>
                  Salvar grava o DBML atual em arquivo. Use Menu para voltar à tela de esquemas; o app também
                  faz autosave local enquanto você trabalha.
                </p>
              </section>
              <section className="help-section">
                <h3>Dicas rápidas</h3>
                <ul>
                  <li>Use os handles da linha para ajustar trechos e curvas.</li>
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

function DiagramPreview({ dbml, uiLayout, previewDataUrl }: { dbml: string; uiLayout?: string; previewDataUrl?: string }) {
  if (previewDataUrl) {
    return <img className="diagram-card-preview" src={previewDataUrl} alt="Prévia do esquema" />;
  }
  try {
    const diagram = applyUiLayout(parseDbml(dbml), uiLayout);
    if (!diagram.tables.length) return <span className="diagram-card-preview is-empty"><Database size={28} /></span>;
    const padding = 36;
    const left = Math.min(...diagram.tables.map((table) => table.x)) - padding;
    const top = Math.min(...diagram.tables.map((table) => table.y)) - padding;
    const right = Math.max(...diagram.tables.map((table) => table.x + table.width)) + padding;
    const bottom = Math.max(...diagram.tables.map((table) => table.y + table.height)) + padding;
    const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
    return (
      <svg className="diagram-card-preview" viewBox={`${left} ${top} ${Math.max(1, right - left)} ${Math.max(1, bottom - top)}`} aria-label="Prévia do esquema">
        <rect x={left} y={top} width={right - left} height={bottom - top} className="preview-background" />
        {diagram.relations.map((relation) => {
          const from = tableMap.get(relation.fromTable);
          const to = tableMap.get(relation.toTable);
          if (!from || !to) return null;
          return <path key={relation.id} d={getRelationGeometry(relation, from, to).path} className="preview-relation" />;
        })}
        {diagram.tables.map((table) => (
          <g key={table.id}>
            <rect x={table.x} y={table.y} width={table.width} height={table.height} rx={6} className="preview-table" />
            <rect x={table.x} y={table.y} width={table.width} height={38} rx={6} className="preview-table-header" />
          </g>
        ))}
      </svg>
    );
  } catch {
    return <span className="diagram-card-preview is-empty"><Database size={28} /></span>;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : undefined;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return element.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const stored = safeGetItem(key);
  if (stored === "true") return true;
  if (stored === "false") return false;

  return fallback;
}

function writeStoredBoolean(key: string, value: boolean): void {
  safeSetItem(key, String(value));
}
