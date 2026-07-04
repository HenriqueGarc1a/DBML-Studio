import { describe, expect, it } from "vitest";
import { exportDbml } from "./dbmlExporter";
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
  it("exports current layout metadata back to DBML comments", () => {
    const dbml = exportDbml(parseDbml(source));

    expect(dbml).toContain("// @diagram");
    expect(dbml).toContain("// background=#f1f5f9");
    expect(dbml).toContain("// gridColor=#cbd5e1");
    expect(dbml).toContain("// gridSize=10");
    expect(dbml).toContain("// tableBackground=#111827");
    expect(dbml).toContain("// uniqueBadgeBorder=#818cf8");
    expect(dbml).toContain("// savedColors=Marca:#22c55e");
    expect(dbml).toContain("// @table user");
    expect(dbml).toContain("// x=20");
    expect(dbml).toContain("// useDefaultStyle=false");
    expect(dbml).toContain("// useGroupStyle=true");
    expect(dbml).toContain("Ref: project.user_id > user.id");
    expect(dbml).toContain("// style=dashed");
    expect(dbml).toContain("// fromCardinality=one");
    expect(dbml).toContain("// toCardinality=many");
    expect(dbml).toContain("// via=(300,60)");
    expect(dbml).toContain("// @group backend");
    expect(dbml).toContain("// tableBorder=#14b8a6");
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
});
