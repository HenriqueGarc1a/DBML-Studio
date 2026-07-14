import { ArchiveRestore, ArrowDownAZ, BookOpenText, Boxes, Copy, Database, Download, FileArchive, FileUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { DiagramController } from "../../editor/useDiagramController";
import { serializeProjectBundle } from "../../editor/projectBundle";
import { downloadText } from "../../utils/download";
import { DiagramPreview } from "../components/DiagramPreview";
import { SqlImportDialog } from "../components/SqlImportDialog";
import { DatabaseDialog } from "../components/DatabaseDialog";

export function LibraryPage({ controller }: { controller: DiagramController }) {
  const navigate = useNavigate();
  const [sqlOpen, setSqlOpen] = useState(false);
  const [databaseOpen, setDatabaseOpen] = useState(false);
  const [sql, setSql] = useState("");
  const [sqlError, setSqlError] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [nameDraft, setNameDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const [draggingFile, setDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openDiagram = async (id: string) => {
    await controller.openDiagram(id);
    navigate(`/editor/${encodeURIComponent(id)}`);
  };
  const openWiki = async (id: string) => {
    await controller.openDiagram(id);
    navigate(`/editor/${encodeURIComponent(id)}/wiki`);
  };
  const createDiagram = async () => {
    const id = await controller.createDiagram();
    toast.success("Novo esquema criado");
    navigate(`/editor/${encodeURIComponent(id)}`);
  };
  const importSql = async () => {
    setSqlError("");
    try {
      const id = await controller.createDiagramFromSql(sql);
      setSqlOpen(false);
      setSql("");
      toast.success("SQL importado com sucesso");
      navigate(`/editor/${encodeURIComponent(id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível traduzir o SQL.";
      setSqlError(message);
      toast.error(message);
    }
  };

  const importFile = async (file: File) => {
    try {
      const contents = await file.text();
      const id = file.name.toLowerCase().endsWith(".json")
        ? await controller.importProjectBundle(contents)
        : await controller.importDiagramDbml(file.name, contents);
      toast.success(file.name.toLowerCase().endsWith(".json") ? "Pacote importado" : "DBML importado");
      navigate(`/editor/${encodeURIComponent(id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setDraggingFile(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void importFile(file);
  };

  const visibleDiagrams = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return controller.diagrams
      .filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized) || item.dbml.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
  }, [controller.diagrams, query, sort]);

  const editing = controller.diagrams.find((item) => item.id === editingId);
  return (
    <div className="diagram-library-screen">
      <header className="library-screen-header">
        <div className="brand"><Boxes size={24} /><div><h1>DBML Studio</h1><span>Escolha um esquema para continuar</span></div></div>
        <div className="library-header-actions">
          <input ref={fileInputRef} type="file" hidden accept=".dbml,.json,.dbmlstudio.json,text/plain,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
          <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}><FileUp size={16} />Importar arquivo</button>
          <button type="button" className="secondary-button" onClick={() => setSqlOpen(true)}><Database size={16} />Importar SQL</button>
          <button type="button" className="secondary-button" onClick={() => setDatabaseOpen(true)}><Database size={16} />Conectar banco</button>
          <button type="button" onClick={() => void createDiagram()}><Plus size={16} />Novo esquema</button>
        </div>
      </header>
      <main className={`diagram-library-home${draggingFile ? " is-file-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFile(false); }} onDrop={onDrop}>
        {draggingFile && <div className="library-drop-overlay"><FileUp size={28} /><strong>Solte o DBML ou pacote aqui</strong></div>}
        <div className="library-home-heading"><div><h2>Seus esquemas</h2><p>{controller.diagrams.length} arquivo{controller.diagrams.length === 1 ? "" : "s"}</p></div><div className="library-tools"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tabela, campo ou projeto…" /></label><button type="button" className="secondary-button" onClick={() => setSort((current) => current === "updated" ? "name" : "updated")} title="Alternar ordenação"><ArrowDownAZ size={15} />{sort === "updated" ? "Recentes" : "Nome"}</button></div></div>
        <div className="diagram-card-grid">
          {visibleDiagrams.map((item) => (
            <article key={item.id} className="diagram-card">
              <button type="button" className="diagram-card-open" onClick={() => void openDiagram(item.id)}>
                <DiagramPreview dbml={item.dbml} uiLayout={item.uiLayout} previewDataUrl={item.previewDataUrl} />
                <span className="diagram-card-copy"><strong>{item.name}</strong><small>{item.filename ?? `${item.name}.dbml`}</small><time dateTime={new Date(item.updatedAt).toISOString()}>Atualizado {formatRelativeDate(item.updatedAt)}</time></span>
              </button>
              <button type="button" className="diagram-card-wiki" title={`Abrir a wiki de ${item.name}`} onClick={() => void openWiki(item.id)}><BookOpenText size={14} />Wiki</button>
              <button type="button" className="diagram-card-edit icon-button" title="Editar esquema" onClick={() => { setEditingId(item.id); setNameDraft(item.name); }}><Pencil size={14} /></button>
            </article>
          ))}
        </div>
        {!visibleDiagrams.length && <div className="library-empty-search"><Search size={24} /><strong>Nenhum esquema encontrado</strong><span>Tente outro nome, tabela ou campo.</span></div>}
        {controller.trashedDiagrams.length > 0 && <section className="library-trash"><div className="library-home-heading"><div><h2>Lixeira</h2><p>Projetos podem ser restaurados neste navegador</p></div></div><div className="library-trash-list">{controller.trashedDiagrams.map((item) => <article key={`${item.id}-${item.trashedAt}`}><div><strong>{item.name}</strong><small>Excluído {formatRelativeDate(item.trashedAt)}</small></div><button type="button" className="secondary-button" onClick={() => void controller.restoreDiagram(item.id).then((id) => { if (id) toast.success("Projeto restaurado"); })}><ArchiveRestore size={14} />Restaurar</button><button type="button" className="icon-button danger-action" title="Excluir definitivamente" aria-label={`Excluir definitivamente ${item.name}`} onClick={() => { if (window.confirm(`Excluir "${item.name}" definitivamente da lixeira local?`)) controller.purgeTrashedDiagram(item.id); }}><Trash2 size={14} /></button></article>)}</div></section>}
      </main>
      {sqlOpen && <SqlImportDialog value={sql} error={sqlError} onChange={setSql} onClose={() => setSqlOpen(false)} onImport={() => void importSql()} />}
      {databaseOpen && <DatabaseDialog mode="create" onClose={() => setDatabaseOpen(false)} onCreateProject={async (name, dbml) => { const id = await controller.importDiagramDbml(`${name}.dbml`, dbml); navigate(`/editor/${encodeURIComponent(id)}`); }} />}
      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingId(undefined)}>
          <section className="modal-panel diagram-edit-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><h2>Editar esquema</h2><button type="button" className="icon-button" onClick={() => setEditingId(undefined)}><X size={16} /></button></div>
            <div className="diagram-edit-body"><label><span>Nome</span><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} autoFocus /></label><small>{editing.filename}</small></div>
            <div className="diagram-edit-secondary-actions">
              <button type="button" className="secondary-button" onClick={() => void controller.duplicateDiagram(editing.id).then((id) => { setEditingId(undefined); toast.success("Projeto duplicado"); navigate(`/editor/${encodeURIComponent(id)}`); }).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível duplicar"))}><Copy size={15} />Duplicar</button>
              <button type="button" className="secondary-button" onClick={() => downloadText(editing.filename ?? `${editing.name}.dbml`, editing.dbml)}><Download size={15} />DBML</button>
              <button type="button" className="secondary-button" onClick={() => downloadText(`${(editing.filename ?? "projeto.dbml").replace(/\.dbml$/i, "")}.dbmlstudio.json`, serializeProjectBundle(editing))}><FileArchive size={15} />Pacote</button>
            </div>
            <div className="modal-actions diagram-edit-actions">
              <button type="button" className="secondary-button danger-action" disabled={controller.diagrams.length <= 1} onClick={() => {
                if (window.confirm(`Excluir o esquema "${editing.name}"?`)) void controller.deleteDiagram(editing.id).then((ok) => { if (ok) { toast.success("Esquema excluído"); setEditingId(undefined); } else toast.error("Não foi possível excluir"); });
              }}><Trash2 size={15} />Excluir</button>
              <button type="button" className="secondary-button" onClick={() => setEditingId(undefined)}>Cancelar</button>
              <button type="button" disabled={!nameDraft.trim()} onClick={() => void controller.renameSavedDiagram(editing.id, nameDraft).then((ok) => { if (ok) { toast.success("Esquema renomeado"); setEditingId(undefined); } else toast.error("Nome indisponível ou arquivo não encontrado"); })}>Salvar</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  if (delta < minute) return "agora";
  if (delta < 60 * minute) return `há ${Math.max(1, Math.floor(delta / minute))} min`;
  if (delta < 24 * 60 * minute) return `há ${Math.floor(delta / (60 * minute))} h`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(timestamp);
}
