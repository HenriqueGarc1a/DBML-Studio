import { describe, expect, it } from "vitest";
import { parseDbml } from "./dbmlParser";

const source = `// @diagram
// background=#eef2ff
// gridColor=#c7d2fe
// gridSize=12

// @table user
// x=10
// y=20
// width=280
// background=#ffffff
// border=#2563eb
// header=#dbeafe
// text=#111827

Table user {
  id int [pk, not null]
  email varchar [not null, unique]
}

Table project {
  id int [pk, not null]
  user_id int [not null]
  name varchar [default: 'active']
}

Enum status {
  active
  archived
}

Ref: project.user_id > user.id
// @line
// color=#dc2626
// strokeWidth=3
// opacity=0.8
// style=dashed
// route=orthogonal
// from=west
// to=east
// via=(100,120),(200,120)

// @group backend
// label=Backend Core
// x=0
// y=0
// width=640
// height=320
// background=#0f766e
// border=#0f766e
// opacity=0.14
// tables=user,project
`;

describe("parseDbml", () => {
  it("parses tables, enums, refs and visual comment blocks", () => {
    const diagram = parseDbml(source);

    expect(diagram.tables).toHaveLength(2);
    expect(diagram.enums).toHaveLength(1);
    expect(diagram.relations).toHaveLength(1);
    expect(diagram.groups).toHaveLength(1);
    expect(diagram.visual.backgroundColor).toBe("#eef2ff");
    expect(diagram.visual.gridColor).toBe("#c7d2fe");
    expect(diagram.visual.gridSize).toBe(12);

    const user = diagram.tables.find((table) => table.id === "user");
    expect(user?.x).toBe(10);
    expect(user?.visual.borderColor).toBe("#2563eb");
    expect(user?.columns[0].primaryKey).toBe(true);

    const project = diagram.tables.find((table) => table.id === "project");
    expect(project?.columns.find((column) => column.name === "user_id")?.foreignKey).toBe(true);

    expect(diagram.relations[0]).toMatchObject({
      fromTable: "project",
      fromColumn: "user_id",
      toTable: "user",
      toColumn: "id",
      fromCardinality: "many",
      toCardinality: "one",
      color: "#dc2626",
      strokeWidth: 3,
      style: "dashed",
      route: "orthogonal",
      fromSide: "west",
      toSide: "east",
    });
    expect(diagram.relations[0].viaPoints).toEqual([
      { x: 100, y: 120 },
      { x: 200, y: 120 },
    ]);

    expect(diagram.groups[0]).toMatchObject({
      label: "Backend Core",
      opacity: 0.14,
      tables: ["user", "project"],
    });
  });

  it("keeps table height large enough for all rows", () => {
    const diagram = parseDbml(`// @table audit_log
// height=40

Table audit_log {
  id int [pk]
  user_id int
  action varchar
  created_at timestamp
}`);

    expect(diagram.tables[0].height).toBe(150);
  });

  it("rejects unfinished DBML blocks", () => {
    expect(() => parseDbml(`Table broken {
  id int [pk]
`)).toThrow(/nao foi fechada/);
  });
});
