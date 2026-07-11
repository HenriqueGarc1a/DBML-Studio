import { BookOpenText, Boxes, Database, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { DiagramController } from "../../editor/useDiagramController";
import { DiagramPreview } from "../components/DiagramPreview";
import { SqlImportDialog } from "../components/SqlImportDialog";

export function LibraryPage({ controller }: { controller: DiagramController }) {
  const navigate = useNavigate();
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sql, setSql] = useState("");
  const [sqlError, setSqlError] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [nameDraft, setNameDraft] = useState("");

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

  const editing = controller.diagrams.find((item) => item.id === editingId);
  return (
    <div className="diagram-library-screen">
      <header className="library-screen-header">
        <div className="brand"><Boxes size={24} /><div><h1>DBML Studio</h1><span>Escolha um esquema para continuar</span></div></div>
        <div className="library-header-actions">
          <button type="button" className="secondary-button" onClick={() => setSqlOpen(true)}><Database size={16} />Importar SQL</button>
          <button type="button" onClick={() => void createDiagram()}><Plus size={16} />Novo esquema</button>
        </div>
      </header>
      <main className="diagram-library-home">
        <div className="library-home-heading"><h2>Seus esquemas</h2><p>{controller.diagrams.length} arquivo{controller.diagrams.length === 1 ? "" : "s"}</p></div>
        <div className="diagram-card-grid">
          {controller.diagrams.map((item) => (
            <article key={item.id} className="diagram-card">
              <button type="button" className="diagram-card-open" onClick={() => void openDiagram(item.id)}>
                <DiagramPreview dbml={item.dbml} uiLayout={item.uiLayout} previewDataUrl={item.previewDataUrl} />
                <span className="diagram-card-copy"><strong>{item.name}</strong><small>{item.filename ?? `${item.name}.dbml`}</small></span>
              </button>
              <button type="button" className="diagram-card-wiki" title={`Abrir a wiki de ${item.name}`} onClick={() => void openWiki(item.id)}><BookOpenText size={14} />Wiki</button>
              <button type="button" className="diagram-card-edit icon-button" title="Editar esquema" onClick={() => { setEditingId(item.id); setNameDraft(item.name); }}><Pencil size={14} /></button>
            </article>
          ))}
        </div>
      </main>
      {sqlOpen && <SqlImportDialog value={sql} error={sqlError} onChange={setSql} onClose={() => setSqlOpen(false)} onImport={() => void importSql()} />}
      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingId(undefined)}>
          <section className="modal-panel diagram-edit-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><h2>Editar esquema</h2><button type="button" className="icon-button" onClick={() => setEditingId(undefined)}><X size={16} /></button></div>
            <div className="diagram-edit-body"><label><span>Nome</span><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} autoFocus /></label><small>{editing.filename}</small></div>
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
