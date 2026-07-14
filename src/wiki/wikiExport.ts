import type { jsPDF as JsPdfInstance } from "jspdf";
import { parseMarkdownBlocks, type MarkdownBlock, type MarkdownInline } from "./markdownParser";

export function buildWikiHtml(title: string, markdown: string): string {
  const body = parseMarkdownBlocks(markdown).map(renderBlock).join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${WIKI_HTML_CSS}</style></head><body><main>${body}</main></body></html>`;
}

export function downloadWikiHtml(filename: string, title: string, markdown: string): boolean {
  return downloadBlob(filename, new Blob([buildWikiHtml(title, markdown)], { type: "text/html;charset=utf-8" }));
}

export async function exportWikiPdf(filename: string, title: string, markdown: string): Promise<boolean> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" }) as JsPdfInstance;
  const margin = 48;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addLines = (text: string, size = 10, weight: "normal" | "bold" = "normal", gap = 5) => {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text || " ", maxWidth) as string[];
    const lineHeight = size * 1.45;
    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };

  addLines(title, 22, "bold", 14);
  for (const block of parseMarkdownBlocks(markdown)) {
    if (block.type === "heading") addLines(inlineText(block.children), Math.max(12, 22 - block.level * 2), "bold", 8);
    else if (block.type === "paragraph") addLines(inlineText(block.children));
    else if (block.type === "list") block.items.forEach((item, index) => addLines(`${block.ordered ? `${(block.start ?? 1) + index}.` : "•"} ${inlineText(item)}`, 10, "normal", 1));
    else if (block.type === "blockquote") addLines(block.children.map(blockText).join(" "), 10, "normal", 7);
    else if (block.type === "code") addLines(block.value, 9, "normal", 8);
    else if (block.type === "table") {
      addLines(block.headers.map(inlineText).join("  |  "), 9, "bold", 2);
      block.rows.forEach((row) => addLines(row.map(inlineText).join("  |  "), 8, "normal", 1));
      y += 6;
    } else if (block.type === "divider") y += 10;
    else if (block.type === "toc") block.headings.forEach((heading) => addLines(`${"  ".repeat(Math.max(0, heading.level - 1))}${heading.text}`, 9, "normal", 1));
  }
  pdf.save(filename);
  return true;
}

function renderBlock(block: MarkdownBlock): string {
  if (block.type === "heading") return `<h${block.level} id="${escapeHtml(block.id)}">${renderInlines(block.children)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p>${renderInlines(block.children)}</p>`;
  if (block.type === "list") return `<${block.ordered ? "ol" : "ul"}${block.ordered && block.start ? ` start="${block.start}"` : ""}>${block.items.map((item) => `<li>${renderInlines(item)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
  if (block.type === "blockquote") return `<blockquote>${block.children.map(renderBlock).join("")}</blockquote>`;
  if (block.type === "code") return `<pre><code>${escapeHtml(block.value)}</code></pre>`;
  if (block.type === "divider") return "<hr>";
  if (block.type === "table") return `<div class="table-wrap"><table><thead><tr>${block.headers.map((cell) => `<th>${renderInlines(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlines(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return `<nav class="toc"><ol>${block.headings.map((heading) => `<li class="level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join("")}</ol></nav>`;
}

function renderInlines(items: MarkdownInline[]): string {
  return items.map((item) => {
    if (item.type === "text") return escapeHtml(item.value);
    if (item.type === "code") return `<code>${escapeHtml(item.value)}</code>`;
    if (item.type === "line-break") return "<br>";
    if (item.type === "strong") return `<strong>${renderInlines(item.children)}</strong>`;
    if (item.type === "emphasis") return `<em>${renderInlines(item.children)}</em>`;
    return `<a href="${escapeHtml(item.href)}"${item.title ? ` title="${escapeHtml(item.title)}"` : ""}>${renderInlines(item.children)}</a>`;
  }).join("");
}

function inlineText(items: MarkdownInline[]): string {
  return items.map((item) => item.type === "text" || item.type === "code" ? item.value : item.type === "line-break" ? "\n" : inlineText(item.children)).join("");
}

function blockText(block: MarkdownBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return inlineText(block.children);
  if (block.type === "list") return block.items.map(inlineText).join("; ");
  if (block.type === "blockquote") return block.children.map(blockText).join(" ");
  if (block.type === "code") return block.value;
  if (block.type === "table") return [...block.headers, ...block.rows.flat()].map(inlineText).join(" | ");
  if (block.type === "toc") return block.headings.map((heading) => heading.text).join("; ");
  return "";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function downloadBlob(filename: string, blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

const WIKI_HTML_CSS = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#172033;font:15px/1.65 Inter,system-ui,sans-serif}main{width:min(980px,calc(100% - 32px));margin:0 auto;padding:56px 0 90px}h1,h2,h3,h4{line-height:1.22;color:#0f172a}h1{font-size:36px}h2{margin-top:42px;border-bottom:1px solid #cbd5e1;padding-bottom:8px}a{color:#0f766e}code,pre{font-family:ui-monospace,monospace}code{background:#e2e8f0;border-radius:4px;padding:2px 4px}pre{overflow:auto;border-radius:8px;padding:14px;background:#0f172a;color:#e2e8f0}blockquote{margin-left:0;border-left:4px solid #14b8a6;padding-left:16px;color:#475569}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}th{background:#e2e8f0}.toc{padding:14px 20px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.toc li{margin:4px 0}.toc .level-2{margin-left:16px}.toc .level-3{margin-left:32px}@media print{body{background:#fff}main{width:100%;padding:0}}`;
