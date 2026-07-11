export type MarkdownEditAction =
  | "heading-1"
  | "heading-2"
  | "bold"
  | "italic"
  | "link"
  | "bullet-list"
  | "numbered-list"
  | "quote"
  | "inline-code"
  | "code-block"
  | "table"
  | "divider"
  | "toc";

export interface MarkdownEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyMarkdownEdit(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownEditAction,
): MarkdownEditResult {
  switch (action) {
    case "heading-1": return prefixSelectedLines(value, selectionStart, selectionEnd, "# ", "Título");
    case "heading-2": return prefixSelectedLines(value, selectionStart, selectionEnd, "## ", "Seção");
    case "bold": return wrapSelection(value, selectionStart, selectionEnd, "**", "**", "texto em negrito");
    case "italic": return wrapSelection(value, selectionStart, selectionEnd, "_", "_", "texto em itálico");
    case "inline-code": return wrapSelection(value, selectionStart, selectionEnd, "`", "`", "código");
    case "link": return insertLink(value, selectionStart, selectionEnd);
    case "bullet-list": return prefixSelectedLines(value, selectionStart, selectionEnd, "- ", "Item da lista");
    case "numbered-list": return prefixSelectedLines(value, selectionStart, selectionEnd, (_, index) => `${index + 1}. `, "Item da lista");
    case "quote": return prefixSelectedLines(value, selectionStart, selectionEnd, "> ", "Citação");
    case "code-block": return insertBlock(value, selectionStart, selectionEnd, "```\n", "\n```", "código");
    case "table": return insertAtSelection(value, selectionStart, selectionEnd, "| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Valor | Valor |", 2, 10);
    case "divider": return insertAtSelection(value, selectionStart, selectionEnd, "---", 3, 3);
    case "toc": return insertAtSelection(value, selectionStart, selectionEnd, "_TOC_", 5, 5);
  }
}

export function insertPlainText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
): MarkdownEditResult {
  return insertAtSelection(value, selectionStart, selectionEnd, text, text.length, text.length);
}

function wrapSelection(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownEditResult {
  const selected = value.slice(start, end) || placeholder;
  const insertion = `${prefix}${selected}${suffix}`;
  const next = replaceRange(value, start, end, insertion);
  const contentStart = start + prefix.length;
  return {
    value: next,
    selectionStart: contentStart,
    selectionEnd: contentStart + selected.length,
  };
}

function insertLink(value: string, start: number, end: number): MarkdownEditResult {
  const selected = value.slice(start, end) || "texto do link";
  const insertion = `[${selected}](https://)`;
  const next = replaceRange(value, start, end, insertion);
  const urlStart = start + selected.length + 3;
  return { value: next, selectionStart: urlStart, selectionEnd: urlStart + 8 };
}

function insertBlock(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): MarkdownEditResult {
  const selected = value.slice(start, end) || placeholder;
  const before = start > 0 && value[start - 1] !== "\n" ? "\n\n" : "";
  const after = end < value.length && value[end] !== "\n" ? "\n\n" : "";
  const insertion = `${before}${prefix}${selected}${suffix}${after}`;
  const next = replaceRange(value, start, end, insertion);
  const contentStart = start + before.length + prefix.length;
  return { value: next, selectionStart: contentStart, selectionEnd: contentStart + selected.length };
}

function prefixSelectedLines(
  value: string,
  start: number,
  end: number,
  prefix: string | ((line: string, index: number) => string),
  placeholder: string,
): MarkdownEditResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndMatch = value.indexOf("\n", end);
  const lineEnd = lineEndMatch === -1 ? value.length : lineEndMatch;
  const selectedLines = value.slice(lineStart, lineEnd) || placeholder;
  const lines = selectedLines.split("\n");
  const prefixed = lines.map((line, index) => `${typeof prefix === "function" ? prefix(line, index) : prefix}${line}`).join("\n");
  const next = replaceRange(value, lineStart, lineEnd, prefixed);
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}

function insertAtSelection(
  value: string,
  start: number,
  end: number,
  text: string,
  relativeStart: number,
  relativeEnd: number,
): MarkdownEditResult {
  const needsBefore = start > 0 && value[start - 1] !== "\n";
  const needsAfter = end < value.length && value[end] !== "\n";
  const before = needsBefore ? "\n\n" : "";
  const after = needsAfter ? "\n\n" : "";
  const insertion = `${before}${text}${after}`;
  const next = replaceRange(value, start, end, insertion);
  return {
    value: next,
    selectionStart: start + before.length + relativeStart,
    selectionEnd: start + before.length + relativeEnd,
  };
}

function replaceRange(value: string, start: number, end: number, replacement: string): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}
