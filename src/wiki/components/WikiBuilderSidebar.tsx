import { Archive, BookOpenText, Check, Database, FilePlus2, Search, Table2, Text, WrapText } from "lucide-react";
import { useMemo, useState } from "react";
import { getTableDocumentationProgress, type WikiDocument } from "../wikiDocument";

export type WikiBuilderSelection =
  | { kind: "overview" }
  | { kind: "database" }
  | { kind: "table"; id: string }
  | { kind: "custom"; id: string }
  | { kind: "conclusion" }
  | { kind: "archive" };

interface WikiBuilderSidebarProps {
  document: WikiDocument;
  selection: WikiBuilderSelection;
  onSelect(selection: WikiBuilderSelection): void;
  onAddCustomSection(): void;
}

export function WikiBuilderSidebar({ document, selection, onSelect, onAddCustomSection }: WikiBuilderSidebarProps) {
  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const tables = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return document.tables.filter((table) => {
      const matches = !normalized || table.binding.name.toLocaleLowerCase().includes(normalized);
      return matches && (!onlyIncomplete || getTableDocumentationProgress(table) < 100);
    });
  }, [document.tables, onlyIncomplete, query]);
  const archivedCount = document.archivedTables.length +
    document.tables.reduce((sum, table) => sum + table.archivedFields.length, 0);

  return (
    <aside className="wiki-builder-sidebar" aria-label="Estrutura da Wiki">
      <div className="wiki-builder-sidebar-heading">
        <span>Estrutura da Wiki</span>
        <small>Escolha uma seção para editar</small>
      </div>

      <nav className="wiki-builder-nav" aria-label="Seções principais">
        <SidebarButton active={selection.kind === "overview"} icon={BookOpenText} label="Apresentação" onClick={() => onSelect({ kind: "overview" })} />
        <SidebarButton active={selection.kind === "database"} icon={Database} label="Banco de dados" onClick={() => onSelect({ kind: "database" })} />
      </nav>

      <div className="wiki-builder-nav-group">
        <div className="wiki-builder-nav-title"><span><Table2 size={14} />Dicionário</span><small>{document.tables.length}</small></div>
        <label className="wiki-builder-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tabela…" aria-label="Buscar tabela" />
        </label>
        <label className="wiki-builder-filter">
          <input type="checkbox" checked={onlyIncomplete} onChange={(event) => setOnlyIncomplete(event.target.checked)} />
          Somente pendentes
        </label>
        <div className="wiki-builder-table-nav">
          {tables.map((table) => {
            const progress = getTableDocumentationProgress(table);
            const active = selection.kind === "table" && selection.id === table.id;
            return (
              <button type="button" key={table.id} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={() => onSelect({ kind: "table", id: table.id })}>
                <span>{table.binding.name}</span>
                <small className={progress === 100 ? "is-complete" : ""}>{progress === 100 ? <Check size={12} /> : `${progress}%`}</small>
              </button>
            );
          })}
          {!tables.length && <p className="wiki-builder-nav-empty">Nenhuma tabela encontrada.</p>}
        </div>
      </div>

      <div className="wiki-builder-nav-group">
        <div className="wiki-builder-nav-title"><span><Text size={14} />Seções extras</span><small>{document.customSections.length}</small></div>
        <div className="wiki-builder-custom-nav">
          {document.customSections.map((section) => {
            const active = selection.kind === "custom" && selection.id === section.id;
            return <button type="button" key={section.id} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={() => onSelect({ kind: "custom", id: section.id })}><span>{section.title || "Seção sem título"}</span></button>;
          })}
          <button type="button" className="wiki-builder-add-section" onClick={onAddCustomSection}><FilePlus2 size={14} />Adicionar seção</button>
        </div>
      </div>

      <nav className="wiki-builder-nav wiki-builder-nav-footer" aria-label="Seções finais">
        <SidebarButton active={selection.kind === "conclusion"} icon={WrapText} label="Conclusão" onClick={() => onSelect({ kind: "conclusion" })} />
        {archivedCount > 0 && <SidebarButton active={selection.kind === "archive"} icon={Archive} label="Conteúdo arquivado" badge={String(archivedCount)} onClick={() => onSelect({ kind: "archive" })} />}
      </nav>
    </aside>
  );
}

function SidebarButton({ active, icon: Icon, label, badge, onClick }: {
  active: boolean;
  icon: typeof BookOpenText;
  label: string;
  badge?: string;
  onClick(): void;
}) {
  return <button type="button" className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={onClick}><Icon size={15} /><span>{label}</span>{badge && <small>{badge}</small>}</button>;
}
