import { describe, expect, it } from "vitest";
import { parseDbml } from "../parser/dbmlParser";
import { createWikiDocument } from "./wikiDocument";
import { generateWikiMarkdownFromDocument, getWikiColumnRestrictions } from "./wikiDocumentMarkdown";

describe("Wiki estruturada integrada ao parser DBML", () => {
  it("deriva FK e relacionamento de uma referência declarada no DBML", () => {
    const diagram = parseDbml(`Table customers {
  id uuid [pk, not null]
}

Table orders {
  id uuid [pk, not null]
  customer_id uuid [not null]
}

Ref: orders.customer_id > customers.id
`);
    const orders = diagram.tables.find((table) => table.name === "orders")!;
    const customerId = orders.columns.find((column) => column.name === "customer_id")!;
    const markdown = generateWikiMarkdownFromDocument(diagram, createWikiDocument(diagram, "Loja"));

    expect(getWikiColumnRestrictions(diagram, orders, customerId)).toContain("FK → customers.id");
    expect(markdown).toContain("FK → `customers.id`<br>NOT NULL");
    expect(markdown).toContain("referencia `customers.id`");
  });
});
