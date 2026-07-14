import { describe, expect, it } from "vitest";
import { buildWikiHtml } from "./wikiExport";

describe("wikiExport", () => {
  it("builds a standalone safe HTML document", () => {
    const html = buildWikiHtml("Loja & Dados", "# Visão\n\n**Texto** <script>alert(1)</script>\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Loja &amp; Dados");
    expect(html).toContain("<strong>Texto</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<table>");
  });
});
