import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WikiPreview } from "./components/WikiPreview";
import {
  extractMarkdownHeadings,
  parseMarkdownBlocks,
  parseMarkdownInlines,
  sanitizeMarkdownHref,
  type MarkdownBlock,
} from "./markdownParser";

describe("markdownParser", () => {
  it("extrai títulos com ids estáveis, acentos e sufixos para duplicatas", () => {
    const markdown = [
      "# Visão Geral",
      "## Usuários & Perfis",
      "## Usuários & Perfis",
      "```md",
      "# Não é um título",
      "```",
      "### `API` **Pública**",
    ].join("\n");

    expect(extractMarkdownHeadings(markdown)).toEqual([
      { level: 1, text: "Visão Geral", id: "visão-geral", line: 0 },
      { level: 2, text: "Usuários & Perfis", id: "usuários-perfis", line: 1 },
      { level: 2, text: "Usuários & Perfis", id: "usuários-perfis-2", line: 2 },
      { level: 3, text: "API Pública", id: "api-pública", line: 6 },
    ]);
  });

  it("gera um sumário navegável com os mesmos ids dos títulos", () => {
    const blocks = parseMarkdownBlocks("_TOC_\n\n# Introdução\n\n## Dados");
    const toc = blocks[0];
    expect(toc).toEqual({
      type: "toc",
      headings: [
        { level: 1, text: "Introdução", id: "introdução", line: 2 },
        { level: 2, text: "Dados", id: "dados", line: 4 },
      ],
    });
    expect(blocks.slice(1).map((block) => block.type)).toEqual(["heading", "heading"]);

    const legacyToc = parseMarkdownBlocks("[[_TOC_]]\n\n# Wiki")[0];
    expect(legacyToc.type).toBe("toc");
  });

  it("analisa os blocos usados pela wiki sem interpretar HTML arbitrário", () => {
    const markdown = [
      "Parágrafo com **força**, _ênfase_, `código` e [guia](https://example.com/docs).",
      "",
      "- primeiro",
      "- segundo",
      "",
      "3. terceiro",
      "4. quarto",
      "",
      "> Observação importante.",
      "",
      "```sql",
      "select * from users;",
      "```",
      "",
      "---",
      "",
      "<script>alert('não executar')</script>",
    ].join("\n");

    const blocks = parseMarkdownBlocks(markdown);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "list",
      "list",
      "blockquote",
      "code",
      "divider",
      "paragraph",
    ]);
    expect(blocks[1]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true, start: 3 });
    expect(blocks[4]).toEqual({ type: "code", language: "sql", value: "select * from users;" });
    expect(blocks[6]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", value: "<script>alert('não executar')</script>" }],
    });
  });

  it("analisa tabelas GFM, alinhamento, pipes escapados e quebras br seguras", () => {
    const markdown = [
      "| Campo | Descrição | Restrição |",
      "| :--- | :---: | ---: |",
      "| email | Login\\|contato | UNIQUE<br>NOT NULL |",
      "| status | `a|b` | DEFAULT `active` |",
    ].join("\n");
    const [table] = parseMarkdownBlocks(markdown);

    expect(table.type).toBe("table");
    if (table.type !== "table") return;
    expect(table.alignments).toEqual(["left", "center", "right"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][1]).toEqual([{ type: "text", value: "Login|contato" }]);
    expect(table.rows[0][2]).toEqual([
      { type: "text", value: "UNIQUE" },
      { type: "line-break" },
      { type: "text", value: "NOT NULL" },
    ]);
    expect(table.rows[1][1]).toEqual([{ type: "code", value: "a|b" }]);
  });

  it("reconhece somente as variantes explícitas de br como quebra segura", () => {
    expect(parseMarkdownInlines("a<br>b<br/>c<br />d<BR />e")).toEqual([
      { type: "text", value: "a" },
      { type: "line-break" },
      { type: "text", value: "b" },
      { type: "line-break" },
      { type: "text", value: "c" },
      { type: "line-break" },
      { type: "text", value: "d" },
      { type: "line-break" },
      { type: "text", value: "e" },
    ]);
    expect(parseMarkdownInlines("a<br class=x>b")).toEqual([
      { type: "text", value: "a<br class=x>b" },
    ]);
  });

  it("aceita links locais e protocolos seguros, rejeitando URLs executáveis", () => {
    expect(sanitizeMarkdownHref("#introdução")).toBe("#introdução");
    expect(sanitizeMarkdownHref("Banco de Dados")).toBe("Banco de Dados");
    expect(sanitizeMarkdownHref("https://example.com")).toBe("https://example.com");
    expect(sanitizeMarkdownHref("mailto:docs@example.com")).toBe("mailto:docs@example.com");
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeMarkdownHref("data:text/html,test")).toBeUndefined();
    expect(sanitizeMarkdownHref("//example.com")).toBeUndefined();

    const inlines = parseMarkdownInlines("[seguro](https://example.com) [ataque](javascript:alert(1))");
    expect(inlines.some((inline) => inline.type === "link" && inline.href.startsWith("javascript:"))).toBe(false);
  });

  it("renderiza React escapando HTML e protegendo links externos", () => {
    const html = renderToStaticMarkup(createElement(WikiPreview, {
      markdown: "# Wiki\n\n[Externo](https://example.com) [Interno](#wiki)\n\n<script>alert(1)</script>",
    }));

    expect(html).toContain('id="wiki"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="#wiki"');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("oculta comentários de controle usados pelo gerador", () => {
    const blocks = parseMarkdownBlocks([
      "<!-- DBML-STUDIO:DATA-DICTIONARY:START -->",
      "# Dicionário",
      "<!-- comentário",
      "interno -->",
      "Texto visível.",
    ].join("\n"));

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "heading", id: "dicionário" });
    expect(textFromParagraph(blocks[1])).toBe("Texto visível.");
  });
});

function textFromParagraph(block: MarkdownBlock): string | undefined {
  if (block.type !== "paragraph") return undefined;
  return block.children.map((inline) => inline.type === "text" ? inline.value : "").join("");
}
