import {
  Bold,
  Braces,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table2,
} from "lucide-react";
import type { ComponentType } from "react";
import type { MarkdownEditAction } from "../markdownEditing";

interface WikiToolbarProps {
  onAction(action: MarkdownEditAction): void;
}

const tools: Array<{ action: MarkdownEditAction; label: string; icon: ComponentType<{ size?: number }> }> = [
  { action: "heading-1", label: "Título 1", icon: Heading1 },
  { action: "heading-2", label: "Título 2", icon: Heading2 },
  { action: "bold", label: "Negrito (Ctrl+B)", icon: Bold },
  { action: "italic", label: "Itálico (Ctrl+I)", icon: Italic },
  { action: "link", label: "Link (Ctrl+K)", icon: Link },
  { action: "bullet-list", label: "Lista", icon: List },
  { action: "numbered-list", label: "Lista numerada", icon: ListOrdered },
  { action: "quote", label: "Citação", icon: Quote },
  { action: "inline-code", label: "Código na linha", icon: Code2 },
  { action: "code-block", label: "Bloco de código", icon: Braces },
  { action: "table", label: "Tabela", icon: Table2 },
  { action: "divider", label: "Divisor", icon: Minus },
  { action: "toc", label: "Sumário", icon: Pilcrow },
];

export function WikiToolbar({ onAction }: WikiToolbarProps) {
  return (
    <div className="wiki-markdown-toolbar" role="toolbar" aria-label="Formatação Markdown">
      {tools.map(({ action, label, icon: Icon }) => (
        <button key={action} type="button" title={label} aria-label={label} onClick={() => onAction(action)}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
