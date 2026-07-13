import { Archive, Database, KeyRound } from "lucide-react";
import type { WikiDocument, WikiTableDocumentation } from "../wikiDocument";

export function WikiArchiveView({ document }: { document: WikiDocument }) {
  const tablesWithArchivedFields = document.tables.filter((table) => table.archivedFields.length > 0);

  return (
    <div className="wiki-builder-form wiki-builder-archive-view">
      <header className="wiki-builder-form-heading">
        <span><Archive size={15} />Conteúdo preservado</span>
        <h2>Conteúdo arquivado</h2>
        <p>Quando uma tabela ou campo sai do diagrama, sua documentação fica guardada aqui para não haver perda de contexto.</p>
      </header>

      {document.archivedTables.length > 0 && (
        <section className="wiki-builder-form-section">
          <div className="wiki-builder-section-heading"><div><Database size={16} /><span><strong>Tabelas removidas</strong><small>{document.archivedTables.length} item(ns) preservado(s)</small></span></div></div>
          <div className="wiki-builder-archived-list">
            {document.archivedTables.map((table) => <ArchivedTable key={table.id} table={table} />)}
          </div>
        </section>
      )}

      {tablesWithArchivedFields.length > 0 && (
        <section className="wiki-builder-form-section">
          <div className="wiki-builder-section-heading"><div><KeyRound size={16} /><span><strong>Campos removidos</strong><small>Preservados em tabelas que ainda existem</small></span></div></div>
          <div className="wiki-builder-archived-list">
            {tablesWithArchivedFields.map((table) => (
              <article key={table.id} className="wiki-builder-archived-card">
                <h3>{table.binding.name}</h3>
                <ArchivedFields table={table} />
              </article>
            ))}
          </div>
        </section>
      )}

      {!document.archivedTables.length && !tablesWithArchivedFields.length && (
        <div className="wiki-builder-archive-empty"><Archive size={24} /><strong>Nada arquivado</strong><span>Conteúdos removidos do diagrama aparecerão aqui.</span></div>
      )}
    </div>
  );
}

function ArchivedTable({ table }: { table: WikiTableDocumentation }) {
  return (
    <article className="wiki-builder-archived-card">
      <h3>{table.binding.name}</h3>
      <p>{table.description || "Sem descrição registrada."}</p>
      <ArchivedFields table={{ ...table, archivedFields: [...table.fields, ...table.archivedFields] }} />
      {table.businessRules.some((rule) => rule.text.trim()) && (
        <div><strong>Regras preservadas</strong><ul>{table.businessRules.filter((rule) => rule.text.trim()).map((rule) => <li key={rule.id}>{rule.text}</li>)}</ul></div>
      )}
    </article>
  );
}

function ArchivedFields({ table }: { table: WikiTableDocumentation }) {
  if (!table.archivedFields.length) return null;
  return (
    <div className="wiki-builder-archived-fields">
      {table.archivedFields.map((field) => <div key={field.id}><code>{field.binding.name}</code><span>{field.description || "Sem descrição registrada."}</span></div>)}
    </div>
  );
}
