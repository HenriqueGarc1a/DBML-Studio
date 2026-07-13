import { ArrowDown, ArrowUp, FileText, Trash2 } from "lucide-react";
import type { WikiCustomSection } from "../wikiDocument";

interface WikiCustomSectionFormProps {
  section: WikiCustomSection;
  index: number;
  total: number;
  onChange(section: WikiCustomSection): void;
  onMove(direction: -1 | 1): void;
  onDelete(): void;
}

export function WikiCustomSectionForm({ section, index, total, onChange, onMove, onDelete }: WikiCustomSectionFormProps) {
  return (
    <div className="wiki-builder-form">
      <header className="wiki-builder-form-heading wiki-builder-custom-heading">
        <span><FileText size={15} />Seção personalizada</span>
        <h2>{section.title || "Seção sem título"}</h2>
        <p>Use esta área para decisões arquiteturais, operação, glossário ou qualquer contexto específico do projeto.</p>
        <div>
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} />Subir</button>
          <button type="button" className="secondary-button" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} />Descer</button>
          <button type="button" className="secondary-button danger-action" onClick={onDelete}><Trash2 size={14} />Excluir seção</button>
        </div>
      </header>
      <label className="wiki-builder-field"><span><strong>Título</strong><small>Será exportado como um título principal no Markdown.</small></span><input value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} placeholder="Nome da seção" /></label>
      <label className="wiki-builder-field"><span><strong>Conteúdo</strong><small>Escreva naturalmente. Markdown básico continua disponível para listas, links e código.</small></span><textarea value={section.body} onChange={(event) => onChange({ ...section, body: event.target.value })} rows={18} placeholder="Conteúdo da seção…" /></label>
    </div>
  );
}
