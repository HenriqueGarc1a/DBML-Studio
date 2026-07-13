import { createElement, useMemo, type ReactNode } from "react";
import {
  isExternalMarkdownHref,
  parseMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownInline,
} from "../markdownParser";

export interface WikiPreviewProps {
  markdown: string;
  className?: string;
  emptyMessage?: string;
}

export function WikiPreview({
  markdown,
  className,
  emptyMessage = "Comece a escrever para visualizar a wiki.",
}: WikiPreviewProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);
  const classes = ["wiki-document-pane", "wiki-preview-pane", className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-label="Preview da wiki">
      <div className="wiki-pane-heading"><div><strong>Preview</strong><span>Atualização instantânea</span></div></div>
      <div className="wiki-preview-scroll">
        {blocks.length === 0
          ? <div className="wiki-preview-empty"><p>{emptyMessage}</p></div>
          : <article className="wiki-preview-content">{blocks.map((block, index) => renderBlock(block, `block-${index}`))}</article>}
      </div>
    </section>
  );
}

function renderBlock(block: MarkdownBlock, key: string): ReactNode {
  switch (block.type) {
    case "heading":
      return createElement(
        `h${block.level}`,
        { id: block.id, key },
        renderInlines(block.children, `${key}-inline`),
      );
    case "paragraph":
      return <p key={key}>{renderInlines(block.children, `${key}-inline`)}</p>;
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={`${key}-item-${index}`}>{renderInlines(item, `${key}-item-${index}-inline`)}</li>
      ));
      return block.ordered
        ? <ol key={key} start={block.start}>{items}</ol>
        : <ul key={key}>{items}</ul>;
    }
    case "blockquote":
      return (
        <blockquote key={key}>
          {block.children.map((child, index) => renderBlock(child, `${key}-quote-${index}`))}
        </blockquote>
      );
    case "code": {
      const className = block.language ? `language-${block.language}` : undefined;
      return <pre key={key}><code className={className}>{block.value}</code></pre>;
    }
    case "divider":
      return <hr key={key} />;
    case "table":
      return (
        <div className="wiki-markdown-table-scroll" key={key}>
          <table>
            <thead>
              <tr>{block.headers.map((cell, index) => (
                <th key={`${key}-header-${index}`} style={alignmentStyle(block.alignments[index])}>
                  {renderInlines(cell, `${key}-header-${index}-inline`)}
                </th>
              ))}</tr>
            </thead>
            <tbody>{block.rows.map((row, rowIndex) => (
              <tr key={`${key}-row-${rowIndex}`}>{row.map((cell, cellIndex) => (
                <td key={`${key}-cell-${rowIndex}-${cellIndex}`} style={alignmentStyle(block.alignments[cellIndex])}>
                  {renderInlines(cell, `${key}-cell-${rowIndex}-${cellIndex}-inline`)}
                </td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      );
    case "toc":
      return (
        <nav className="wiki-markdown-toc" aria-label="Sumário" key={key}>
          {block.headings.length > 0 ? (
            <ol>{block.headings.map((heading) => (
              <li className={`wiki-markdown-toc-level-${heading.level}`} key={heading.id}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}</ol>
          ) : <p>Nenhuma seção encontrada.</p>}
        </nav>
      );
  }
}

function renderInlines(nodes: MarkdownInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return <strong key={key}>{renderInlines(node.children, `${key}-strong`)}</strong>;
      case "emphasis":
        return <em key={key}>{renderInlines(node.children, `${key}-emphasis`)}</em>;
      case "code":
        return <code key={key}>{node.value}</code>;
      case "line-break":
        return <br key={key} />;
      case "link": {
        const external = isExternalMarkdownHref(node.href);
        return (
          <a
            href={node.href}
            key={key}
            rel={external ? "noopener noreferrer" : undefined}
            target={external ? "_blank" : undefined}
            title={node.title}
          >
            {renderInlines(node.children, `${key}-link`)}
          </a>
        );
      }
    }
  });
}

function alignmentStyle(alignment: "left" | "center" | "right" | undefined) {
  return alignment ? { textAlign: alignment } as const : undefined;
}
