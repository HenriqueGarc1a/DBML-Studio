import type { KeyboardEvent, RefObject } from "react";
import { WikiToolbar } from "./WikiToolbar";
import type { MarkdownEditAction } from "../markdownEditing";

interface WikiEditorProps {
  value: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange(value: string): void;
  onFormat(action: MarkdownEditAction): void;
}

export function WikiEditor({ value, textareaRef, onChange, onFormat }: WikiEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const element = event.currentTarget;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(start + 2, start + 2);
      });
      return;
    }

    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const action = event.key.toLowerCase() === "b"
      ? "bold"
      : event.key.toLowerCase() === "i"
        ? "italic"
        : event.key.toLowerCase() === "k"
          ? "link"
          : undefined;
    if (action) {
      event.preventDefault();
      onFormat(action);
    }
  };

  return (
    <section className="wiki-document-pane wiki-editor-pane" aria-label="Editor Markdown">
      <div className="wiki-pane-heading">
        <div><strong>Editor</strong><span>Markdown</span></div>
      </div>
      <WikiToolbar onAction={onFormat} />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="# Wiki do projeto\n\nComece a escrever ou gere uma estrutura a partir do esquema…"
        aria-label="Conteúdo Markdown da wiki"
        spellCheck
      />
    </section>
  );
}
