import { BookOpenCheck, FilePlus2, ListTree, RefreshCw, Sparkles } from "lucide-react";
import type { MarkdownHeading } from "../markdownParser";

interface WikiAssistantProps {
  tableCount: number;
  relationCount: number;
  headings: MarkdownHeading[];
  hasContent: boolean;
  onGenerate(): void;
  onRefreshDictionary(): void;
  onStartBlank(): void;
  onHeadingClick(id: string): void;
}

export function WikiAssistant({
  tableCount,
  relationCount,
  headings,
  hasContent,
  onGenerate,
  onRefreshDictionary,
  onStartBlank,
  onHeadingClick,
}: WikiAssistantProps) {
  return (
    <aside className="wiki-assistant">
      <div className="wiki-assistant-intro">
        <span className="wiki-eyebrow"><Sparkles size={14} />Assistente</span>
        <h2>Documente sem começar do zero</h2>
        <p>O conteúdo técnico vem do esquema. Contexto e regras continuam sob seu controle.</p>
      </div>

      <div className="wiki-schema-summary">
        <BookOpenCheck size={18} />
        <div><strong>{tableCount}</strong><span>tabelas</span></div>
        <div><strong>{relationCount}</strong><span>relações</span></div>
      </div>

      <div className="wiki-assistant-actions">
        <button type="button" className="wiki-primary-tool" onClick={onGenerate}>
          <Sparkles size={16} />{hasContent ? "Gerar nova estrutura" : "Gerar a partir do esquema"}
        </button>
        <button type="button" onClick={onRefreshDictionary} disabled={!hasContent}>
          <RefreshCw size={15} />Atualizar dicionário
        </button>
        {hasContent && <small className="wiki-tool-hint">Preserva descrições e regras escritas por você.</small>}
        {!hasContent && <button type="button" className="secondary-button" onClick={onStartBlank}><FilePlus2 size={15} />Começar em branco</button>}
      </div>

      <div className="wiki-outline">
        <div className="wiki-outline-heading"><ListTree size={15} /><strong>Estrutura</strong></div>
        {headings.length > 0 ? (
          <nav aria-label="Sumário da wiki">
            {headings.map((heading) => (
              <button
                type="button"
                key={`${heading.id}-${heading.line}`}
                className={`wiki-outline-level-${Math.min(heading.level, 3)}`}
                onClick={() => onHeadingClick(heading.id)}
                title={heading.text}
              >
                {heading.text}
              </button>
            ))}
          </nav>
        ) : <p className="wiki-outline-empty">Os títulos da documentação aparecerão aqui.</p>}
      </div>
    </aside>
  );
}
