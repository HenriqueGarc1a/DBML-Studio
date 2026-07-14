import { describe, expect, it } from "vitest";
import { exportDbml } from "./dbmlExporter";
import { applyUiLayout, exportUiLayout } from "./uiLayoutFile";
import { exportTikz } from "./tikzExporter";
import { parseDbml } from "../parser/dbmlParser";

const source = `// @diagram
// background=#f1f5f9
// gridColor=#cbd5e1
// gridSize=10
// savedColors=Marca:#22c55e

// @table user
// x=20
// y=30
// width=240
// useGroupStyle=true
// background=#ffffff
// border=#2563eb
// header=#dbeafe
// text=#111827

Table user {
  id int [pk, not null]
  email varchar [not null, unique]
}

// @table project
// x=360
// y=30

Table project {
  id int [pk, not null]
  user_id int [not null]
}

Ref: project.user_id > user.id
// @line
// color=#dc2626
// strokeWidth=2
// style=dashed
// fromCardinality=one
// toCardinality=many
// via=(300,60)

// @group backend
// label=Backend Core
// x=0
// y=0
// width=640
// height=240
// background=#0f766e
// border=#0f766e
// opacity=0.12
// tableBackground=#052e2b
// tableBorder=#14b8a6
// tableHeader=#115e59
// tableText=#ccfbf1
// tableOpacity=0.88
// tables=user,project
`;

describe("exporters", () => {
  it("separates schema DBML from UI layout metadata", () => {
    const diagram = parseDbml(source);
    diagram.relations[0] = {
      ...diagram.relations[0],
      fromSide: "west",
      toSide: "east",
      sideMode: "manual",
    };
    const dbml = exportDbml(diagram);
    const uiLayout = exportUiLayout(diagram);

    expect(dbml).not.toContain("// @diagram");
    expect(dbml).not.toContain("// @table");
    expect(dbml).not.toContain("// @line");
    expect(dbml).toContain("Ref: project.user_id > user.id");
    const restored = applyUiLayout(parseDbml(dbml), uiLayout);
    expect(restored.tables[0]).toMatchObject({ x: 20, usesDefaultStyle: false, usesGroupStyle: true });
    expect(restored.relations[0]).toMatchObject({
      style: "dashed",
      fromSide: "west",
      toSide: "east",
      sideMode: "manual",
      viaPoints: [{ x: 300, y: 60 }],
    });
    expect(restored.groups[0].tables).toEqual(["user", "project"]);
  });

  it("exports a complete TikZ document with groups, tables and relations", () => {
    const tikz = exportTikz(parseDbml(source));

    expect(tikz).toContain("\\documentclass");
    expect(tikz).toContain("\\begin{tikzpicture}");
    expect(tikz).toContain("Backend Core");
    expect(tikz).toContain("\\scriptsize PK NN");
    expect(tikz).toContain("\\scriptsize NN UQ");
    expect(tikz).toContain("\\scriptsize FK NN");
    expect(tikz).toContain("\\draw[dashed");
    expect(tikz).not.toContain("\\draw[->");
    expect(tikz).toContain("\\end{document}");
  });

  it("exports TikZ relations with the effective table line color", () => {
    const tikz = exportTikz(parseDbml(`// @diagram
// tableLine=#123456

Table user {
  id int [pk]
}

Table project {
  user_id int
}

Ref: project.user_id > user.id
`));

    expect(tikz).toContain("draw={rgb,255:red,18;green,52;blue,86}");
  });

  it("keeps a relation when all manual points are removed and saved", () => {
    const diagram = parseDbml(source);
    const relation = diagram.relations[0];
    diagram.relations[0] = { ...relation, viaPoints: [] };

    const dbml = exportDbml(diagram);
    const reparsed = parseDbml(dbml);

    expect(dbml).toContain("Ref: project.user_id > user.id");
    expect(dbml).not.toContain("// @line");
    expect(reparsed.relations).toHaveLength(1);
    expect(reparsed.relations[0]).toMatchObject({
      fromTable: "project",
      fromColumn: "user_id",
      toTable: "user",
      toColumn: "id",
      viaPoints: [],
    });
  });

  it("roundtrips advanced blocks, multiline notes and composite refs without dropping data", () => {
    const advanced = `Project shop {
  database_type: 'PostgreSQL'
}

TablePartial timestamps {
  created_at timestamp
}

Table orders as O {
  tenant_id int [not null]
  id int [pk]
  note text [note: '''
    linha um
    linha dois
  ''']
  ~timestamps
  Note: '''
    Nota da tabela
    continua aqui
  '''
}

Table tenants {
  tenant_id int [not null]
  order_id int [not null]
}

Ref order_tenant: orders.(tenant_id, id) > tenants.(tenant_id, order_id) [delete: cascade]

TableGroup core {
  orders
  tenants
}`;
    const dbml = exportDbml(parseDbml(advanced));
    const restored = parseDbml(dbml);

    expect(dbml).toContain("Project shop");
    expect(dbml).toContain("TablePartial timestamps");
    expect(dbml).toContain("TableGroup core");
    expect(dbml).toContain("Ref order_tenant: orders.(tenant_id, id) > tenants.(tenant_id, order_id) [delete: cascade]");
    expect(restored.tables[0]).toMatchObject({ alias: "O", partials: ["timestamps"], note: "Nota da tabela\ncontinua aqui" });
    expect(restored.tables[0].columns[2].note).toBe("linha um\nlinha dois");
    expect(restored.relations[0].fromColumns).toEqual(["tenant_id", "id"]);
  });

  it("roundtrips checks and read-only records nested in a table", () => {
    const sourceWithChecks = `Table accounts {
  balance integer [check: \`balance >= 0\`]
  debt integer
  checks {
    \`balance - debt >= 0\` [name: 'positive_equity']
  }
  records (balance, debt) {
    100, 20
  }
}`;
    const exported = exportDbml(parseDbml(sourceWithChecks));
    const restored = parseDbml(exported);
    expect(exported).toContain("`balance - debt >= 0` [name: positive_equity]");
    expect(exported).toContain("records (balance, debt)");
    expect(restored.tables[0].checks?.[0].name).toBe("positive_equity");
    expect(restored.tables[0].preservedBlocks?.[0]).toContain("100, 20");
  });
});
