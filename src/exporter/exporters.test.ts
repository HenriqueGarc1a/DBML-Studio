import { describe, expect, it } from "vitest";
import { exportDbml } from "./dbmlExporter";
import { exportTikz } from "./tikzExporter";
import { parseDbml } from "../parser/dbmlParser";

const source = `// @diagram
// background=#f1f5f9
// gridColor=#cbd5e1
// gridSize=10

// @table user
// x=20
// y=30
// width=240
// background=#ffffff
// border=#2563eb
// header=#dbeafe
// text=#111827

Table user {
  id int [pk, not null]
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
// style=rounded
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
// tables=user,project
`;

describe("exporters", () => {
  it("exports current layout metadata back to DBML comments", () => {
    const dbml = exportDbml(parseDbml(source));

    expect(dbml).toContain("// @diagram");
    expect(dbml).toContain("// background=#f1f5f9");
    expect(dbml).toContain("// gridColor=#cbd5e1");
    expect(dbml).toContain("// gridSize=10");
    expect(dbml).toContain("// @table user");
    expect(dbml).toContain("// x=20");
    expect(dbml).toContain("Ref: project.user_id > user.id");
    expect(dbml).toContain("// style=rounded");
    expect(dbml).not.toContain("Cardinality");
    expect(dbml).toContain("// via=(300,60)");
    expect(dbml).toContain("// @group backend");
  });

  it("exports a complete TikZ document with groups, tables and relations", () => {
    const tikz = exportTikz(parseDbml(source));

    expect(tikz).toContain("\\documentclass");
    expect(tikz).toContain("\\begin{tikzpicture}");
    expect(tikz).toContain("Backend Core");
    expect(tikz).toContain("\\draw[solid");
    expect(tikz).not.toContain("\\draw[->");
    expect(tikz).toContain("\\end{document}");
  });
});
