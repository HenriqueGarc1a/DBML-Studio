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
});
