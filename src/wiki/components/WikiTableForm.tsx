import { ArrowDown, ArrowLeftRight, ArrowUp, Database, ExternalLink, KeyRound, Plus, Trash2 } from "lucide-react";
import type { DiagramModel, TableModel } from "../../model/types";
import { getVisualColumns } from "../../model/tableColumns";
import { createWikiBusinessRule, getTableDocumentationProgress, type WikiTableDocumentation } from "../wikiDocument";
import { getWikiColumnRestrictions, getWikiTableRelationships } from "../wikiDocumentMarkdown";

interface WikiTableFormProps {
  diagram: DiagramModel;
  table: TableModel;
  documentation: WikiTableDocumentation;
  onChange(documentation: WikiTableDocumentation): void;
  onEditDiagram(): void;
}

export function WikiTableForm({ diagram, table, documentation, onChange, onEditDiagram }: WikiTableFormProps) {
  const progress = getTableDocumentationProgress(documentation);
  const relationships = getWikiTableRelationships(diagram, table);
  const updateField = (id: string, description: string) => onChange({
    ...documentation,
    fields: documentation.fields.map((field) => field.id === id ? { ...field, description } : field),
  });
  const updateRule = (id: string, text: string) => onChange({
    ...documentation,
    businessRules: documentation.businessRules.map((rule) => rule.id === id ? { ...rule, text } : rule),
  });
  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= documentation.businessRules.length) return;
    const rules = [...documentation.businessRules];
    [rules[index], rules[target]] = [rules[target], rules[index]];
    onChange({ ...documentation, businessRules: rules });
  };

  return (
    <div className="wiki-builder-form wiki-builder-table-form">
      <header className="wiki-builder-form-heading wiki-builder-table-heading">
        <span><Database size={15} />Tabela vinculada ao diagrama</span>
        <div><h2>{table.name}</h2><strong className={progress === 100 ? "is-complete" : ""}>{progress}% documentado</strong></div>
        <p>Nomes, tipos, chaves e relações são sincronizados automaticamente. Aqui você documenta o significado.</p>
        <button type="button" className="secondary-button" onClick={onEditDiagram}><ExternalLink size={14} />Editar estrutura no Diagrama</button>
      </header>

      <label className="wiki-builder-field">
        <span><strong>Responsabilidade da tabela</strong><small>Explique o que esta entidade representa e quando seus dados são usados.</small></span>
        <textarea value={documentation.description} onChange={(event) => onChange({ ...documentation, description: event.target.value })} rows={4} placeholder={`Ex.: A tabela ${table.name} armazena…`} />
      </label>

      <section className="wiki-builder-form-section">
        <div className="wiki-builder-section-heading"><div><KeyRound size={16} /><span><strong>Campos</strong><small>{table.columns.length} campos sincronizados</small></span></div></div>
        <div className="wiki-builder-field-list">
          {getVisualColumns(table).map((column) => {
            const field = documentation.fields.find((item) => item.binding.sourceId === column.id) ?? documentation.fields.find((item) => item.binding.name === column.name);
            if (!field) return null;
            const restrictions = getWikiColumnRestrictions(diagram, table, column);
            return (
              <article className="wiki-builder-column-card" key={field.id}>
                <div className="wiki-builder-column-meta">
                  <div><strong>{column.name}</strong><code>{column.type}</code></div>
                  <span>{restrictions.map((restriction) => <small key={restriction}>{restriction}</small>)}{!restrictions.length && <small>Sem restrições</small>}</span>
                </div>
                <label><span>Descrição</span><textarea value={field.description} onChange={(event) => updateField(field.id, event.target.value)} rows={2} placeholder="O que este campo representa?" /></label>
              </article>
            );
          })}
        </div>
        {documentation.archivedFields.length > 0 && <p className="wiki-builder-archive-note">{documentation.archivedFields.length} campo(s) removido(s) têm documentação preservada em Conteúdo arquivado.</p>}
      </section>

      <section className="wiki-builder-form-section">
        <div className="wiki-builder-section-heading"><div><ArrowLeftRight size={16} /><span><strong>Relacionamentos</strong><small>Somente leitura · derivados do diagrama</small></span></div></div>
        <div className="wiki-builder-relationships">
          {relationships.length ? relationships.map((relationship, index) => <div key={`${relationship}-${index}`}>{relationship}</div>) : <p>Nenhum relacionamento mapeado para esta tabela.</p>}
        </div>
      </section>

      <section className="wiki-builder-form-section">
        <div className="wiki-builder-section-heading"><div><Database size={16} /><span><strong>Regras de negócio</strong><small>Regras funcionais que não aparecem apenas olhando o esquema.</small></span></div><button type="button" onClick={() => onChange({ ...documentation, businessRules: [...documentation.businessRules, createWikiBusinessRule()] })}><Plus size={14} />Adicionar regra</button></div>
        <div className="wiki-builder-rule-list">
          {documentation.businessRules.map((rule, index) => (
            <div key={rule.id}>
              <span>{index + 1}</span>
              <textarea value={rule.text} onChange={(event) => updateRule(rule.id, event.target.value)} rows={2} placeholder="Descreva uma regra de negócio…" />
              <div>
                <button type="button" className="icon-button" title="Mover regra para cima" disabled={index === 0} onClick={() => moveRule(index, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="icon-button" title="Mover regra para baixo" disabled={index === documentation.businessRules.length - 1} onClick={() => moveRule(index, 1)}><ArrowDown size={14} /></button>
                <button type="button" className="icon-button danger-action" title="Remover regra" onClick={() => onChange({ ...documentation, businessRules: documentation.businessRules.filter((item) => item.id !== rule.id) })}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!documentation.businessRules.length && <div className="wiki-builder-rule-empty"><p>Nenhuma regra documentada ainda.</p><button type="button" onClick={() => onChange({ ...documentation, businessRules: [createWikiBusinessRule()] })}><Plus size={14} />Adicionar primeira regra</button></div>}
        </div>
      </section>
    </div>
  );
}
