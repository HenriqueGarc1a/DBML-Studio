import { Clock3, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { DiagramSnapshot } from "../../editor/diagramSnapshots";

export function DiagramHistoryDialog({ snapshots, onRestore, onDelete, onClose }: {
  snapshots: DiagramSnapshot[];
  onRestore(id: string): Promise<boolean>;
  onDelete(id: string): void;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sorted = useMemo(() => [...snapshots].sort((a, b) => b.createdAt - a.createdAt), [snapshots]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal-panel history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="history-title">Histórico de versões</h2><small>Snapshots ficam neste navegador.</small></div><button ref={closeRef} type="button" className="icon-button" aria-label="Fechar histórico" onClick={onClose}><X size={16} /></button></div>
      <div className="history-list">{sorted.map((snapshot) => <article key={snapshot.id}>
        <Clock3 size={16} />
        <div><strong>{formatSnapshotReason(snapshot.reason)}</strong><time dateTime={new Date(snapshot.createdAt).toISOString()}>{new Date(snapshot.createdAt).toLocaleString("pt-BR")}</time></div>
        <button type="button" className="secondary-button" onClick={() => void onRestore(snapshot.id)}><RotateCcw size={14} />Restaurar</button>
        <button type="button" className="icon-button danger-action" aria-label="Excluir versão" title="Excluir versão" onClick={() => onDelete(snapshot.id)}><Trash2 size={14} /></button>
      </article>)}{!sorted.length && <div className="history-empty"><Clock3 size={24} /><strong>Nenhuma versão criada</strong><span>Salvar o projeto cria uma versão restaurável.</span></div>}</div>
    </section>
  </div>;
}

function formatSnapshotReason(reason: DiagramSnapshot["reason"]): string {
  if (reason === "automatic") return "Snapshot automático";
  if (reason === "before-restore") return "Antes de restaurar";
  return "Salvamento manual";
}
