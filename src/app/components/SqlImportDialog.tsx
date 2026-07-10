import { Database, X } from "lucide-react";

interface SqlImportDialogProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
}

export function SqlImportDialog({ value, error, onChange, onClose, onImport }: SqlImportDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="sql-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2 id="sql-import-title">Novo esquema via SQL</h2>
          <button type="button" className="icon-button" title="Fechar" onClick={onClose}><X size={16} /></button>
        </div>
        {error && <div className="modal-error" role="status">{error}</div>}
        <textarea className="sql-import-textarea" value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} autoFocus placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY\n);`} />
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={onImport} disabled={!value.trim()}><Database size={16} />Criar esquema</button>
        </div>
      </section>
    </div>
  );
}
