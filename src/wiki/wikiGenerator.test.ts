import { describe, expect, it } from "vitest";
import { defaultDiagramVisual, defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { ColumnModel, DiagramModel, RelationModel, TableModel } from "../model/types";
import {
  DATA_DICTIONARY_END_MARKER,
  DATA_DICTIONARY_START_MARKER,
  generateWikiMarkdown,
  updateDataDictionaryMarkdown,
} from "./wikiGenerator";

describe("wikiGenerator", () => {
  it("gera uma wiki completa e um dicionário baseado no esquema", () => {
    const markdown = generateWikiMarkdown(createDiagram(), { projectName: "Loja Online" });

    expect(markdown).toContain("# Loja Online");
    expect(markdown).toContain("_TOC_");
    expect(markdown).toContain("# Introdução");
    expect(markdown).toContain("# Visão Geral do Banco de Dados");
    expect(markdown).toContain("# Dicionário de Dados");
    expect(markdown).toContain("# Conclusão");
    expect(markdown).toContain(DATA_DICTIONARY_START_MARKER);
    expect(markdown).toContain(DATA_DICTIONARY_END_MARKER);
    expect(markdown).toContain("**2 tabelas**, **1 relacionamento** e **1 enumeração**");
    expect(markdown.toLowerCase()).not.toContain("conceitual");
    expect(markdown.toLowerCase()).not.toContain("<img");
  });

  it("documenta notas, restrições, índices e relacionamentos dos dois lados", () => {
    const markdown = generateWikiMarkdown(createDiagram());

    expect(markdown).toContain("> Clientes que podem realizar pedidos.");
    expect(markdown).toContain("E-mail usado no login\\|e nas notificações");
    expect(markdown).toMatch(/`id` \| `uuid` \| Identificador do cliente\. \| PK<br>NOT NULL/);
    expect(markdown).toMatch(/`email` \| `varchar\(255\)` .*UNIQUE/);
    expect(markdown).toContain("DEFAULT `pending`");
    expect(markdown).toContain("UNIQUE (`customer_id`, `number`)");
    expect(markdown).toContain("FK → `customers.id`");
    expect(markdown).toContain("`orders.customer_id` referencia `customers.id` (muitos para um)");
    expect(markdown).toContain("`customers.id` é referenciado por `orders.customer_id` (um para muitos)");
  });

  it("atualiza somente o bloco marcado e preserva as edições externas", () => {
    const original = [
      "# Introdução",
      "Texto escrito manualmente.",
      DATA_DICTIONARY_START_MARKER,
      "Dicionário antigo que deve sair.",
      DATA_DICTIONARY_END_MARKER,
      "# Conclusão",
      "Outra edição manual.",
    ].join("\n");

    const updated = updateDataDictionaryMarkdown(original, createDiagram());

    expect(updated.startsWith("# Introdução\nTexto escrito manualmente.\n")).toBe(true);
    expect(updated.endsWith("\n# Conclusão\nOutra edição manual.")).toBe(true);
    expect(updated).not.toContain("Dicionário antigo que deve sair.");
    expect(updated.match(new RegExp(DATA_DICTIONARY_START_MARKER, "g"))).toHaveLength(1);
    expect(updated.match(new RegExp(DATA_DICTIONARY_END_MARKER, "g"))).toHaveLength(1);
  });

  it("insere o bloco antes da conclusão quando uma wiki antiga não possui marcadores", () => {
    const updated = updateDataDictionaryMarkdown(
      "# Introdução\n\nConteúdo legado.\n\n# Conclusão\n\nFim.",
      createDiagram(),
    );

    expect(updated.indexOf(DATA_DICTIONARY_START_MARKER)).toBeGreaterThan(
      updated.indexOf("Conteúdo legado."),
    );
    expect(updated.indexOf(DATA_DICTIONARY_END_MARKER)).toBeLessThan(
      updated.indexOf("# Conclusão"),
    );
    expect(updated).toContain("# Conclusão\n\nFim.");
  });

  it("recusa um bloco com marcadores incompletos para não apagar conteúdo", () => {
    expect(() =>
      updateDataDictionaryMarkdown(
        `# Wiki\n${DATA_DICTIONARY_START_MARKER}\nconteúdo sem fechamento`,
        createDiagram(),
      ),
    ).toThrow(/marcadores/i);
  });
});

function createDiagram(): DiagramModel {
  const customers = table("customers", "Clientes que podem realizar pedidos.", [
    column("id", "uuid", { primaryKey: true, nullable: false, note: "Identificador do cliente." }),
    column("email", "varchar(255)", {
      nullable: false,
      unique: true,
      note: "E-mail usado no login|e nas notificações",
    }),
  ]);
  const orders = table("orders", "Pedidos feitos na loja.", [
    column("id", "uuid", { primaryKey: true, nullable: false }),
    column("customer_id", "uuid", { foreignKey: true, nullable: false }),
    column("number", "int", { nullable: false }),
    column("status", "order_status", { defaultValue: "pending" }),
  ]);
  orders.indexes = [
    {
      columns: ["customer_id", "number"],
      unique: true,
      raw: "(customer_id, number) [unique]",
    },
  ];

  return {
    id: "store",
    source: "",
    visual: defaultDiagramVisual,
    tables: [customers, orders],
    relations: [relation("orders", "customer_id", "customers", "id")],
    groups: [],
    enums: [{ id: "order-status", name: "order_status", values: ["pending", "paid"] }],
  };
}

function table(name: string, note: string, columns: ColumnModel[]): TableModel {
  return {
    id: name,
    name,
    note,
    columns,
    indexes: [],
    x: 0,
    y: 0,
    width: 220,
    height: 120,
    visual: defaultTableVisual,
    usesDefaultStyle: true,
    usesGroupStyle: false,
    layoutSource: "manual",
  };
}

function column(
  name: string,
  type: string,
  overrides: Partial<ColumnModel> = {},
): ColumnModel {
  return {
    id: name,
    name,
    type,
    nullable: true,
    primaryKey: false,
    foreignKey: false,
    rawSettings: [],
    ...overrides,
  };
}

function relation(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn: string,
): RelationModel {
  return {
    id: "orders-customer",
    ...defaultRelationVisual,
    fromTable,
    fromColumn,
    toTable,
    toColumn,
    fromCardinality: "many",
    toCardinality: "one",
    fromSide: "west",
    toSide: "east",
  };
}
