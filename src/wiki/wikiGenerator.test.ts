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
    const original = generateWikiMarkdown(createDiagram())
      .replace("# Introdução\n", "# Introdução\n\nTexto escrito manualmente.\n")
      .replace("# Conclusão\n", "# Conclusão\n\nOutra edição manual.\n");
    const changedDiagram = createDiagram();
    changedDiagram.tables[1].columns.push(column("created_at", "timestamp"));

    const updated = updateDataDictionaryMarkdown(original, changedDiagram);

    expect(updated).toContain("# Introdução\n\nTexto escrito manualmente.");
    expect(updated).toContain("# Conclusão\n\nOutra edição manual.");
    expect(updated).toContain("| `created_at` | `timestamp` | _A documentar._ | — |");
    expect(updated.match(new RegExp(DATA_DICTIONARY_START_MARKER, "g"))).toHaveLength(1);
    expect(updated.match(new RegExp(DATA_DICTIONARY_END_MARKER, "g"))).toHaveLength(1);
  });

  it("preserva textos manuais enquanto atualiza campos, restrições e relacionamentos", () => {
    const original = generateWikiMarkdown(createDiagram())
      .replace(
        "> Pedidos feitos na loja.",
        "> Registro central do fluxo de compra, descrito manualmente na wiki.",
      )
      .replace(
        "| `id` | `uuid` | _A documentar._ | PK<br>NOT NULL |",
        "| `id` | `uuid` | Identificador público preenchido pelo autor. | PK<br>NOT NULL |",
      )
      .replace(
        "| `number` | `int` | _A documentar._ | NOT NULL<br>UNIQUE (`customer_id`, `number`) |",
        "| `number` | `int` | Texto que deve sumir junto com o campo. | NOT NULL<br>UNIQUE (`customer_id`, `number`) |",
      )
      .replace(
        "- [ ] Documentar as regras de negócio relacionadas à tabela `orders`.",
        "- Um pedido pago não pode retornar ao estado pendente.\n- O número é atribuído pela aplicação.",
      );
    const changedDiagram = createDiagram();
    const orders = changedDiagram.tables.find((table) => table.name === "orders")!;
    const orderId = orders.columns.find((item) => item.name === "id")!;
    orderId.unique = true;
    orders.columns = orders.columns.filter((item) => item.name !== "number");
    orders.columns.push(column("created_at", "timestamp", { nullable: false }));
    orders.indexes = [];
    changedDiagram.relations[0].label = "cliente responsável";

    const updated = updateDataDictionaryMarkdown(original, changedDiagram);

    expect(updated).toContain(
      "> Registro central do fluxo de compra, descrito manualmente na wiki.",
    );
    expect(updated).toContain(
      "| `id` | `uuid` | Identificador público preenchido pelo autor. | PK<br>NOT NULL<br>UNIQUE |",
    );
    expect(updated).toContain(
      "| `created_at` | `timestamp` | _A documentar._ | NOT NULL |",
    );
    expect(updated).not.toContain("Texto que deve sumir junto com o campo.");
    expect(updated).not.toContain("| `number` |");
    expect(updated).toContain("cliente responsável");
    expect(updated).toContain("- Um pedido pago não pode retornar ao estado pendente.");
    expect(updated).toContain("- O número é atribuído pela aplicação.");
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

  it("recusa um bloco marcado irreconhecível em vez de apagar seu conteúdo", () => {
    expect(() =>
      updateDataDictionaryMarkdown(
        [
          "# Wiki",
          DATA_DICTIONARY_START_MARKER,
          "Texto livre que não segue a estrutura gerada.",
          DATA_DICTIONARY_END_MARKER,
        ].join("\n"),
        createDiagram(),
      ),
    ).toThrow(/formato esperado/i);
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
