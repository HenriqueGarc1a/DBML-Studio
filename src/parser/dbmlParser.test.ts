import { describe, expect, it } from "vitest";
import { parseDbml } from "./dbmlParser";

const source = `// @diagram
// background=#eef2ff
// gridColor=#c7d2fe
// gridSize=12
// tableBackground=#101827
// tableBorder=#22c55e
// tableHeader=#14532d
// tableText=#f8fafc
// tableLine=#38bdf8
// tableOpacity=0.9
// uniqueBadgeBackground=#312e81
// uniqueBadgeBorder=#a5b4fc
// uniqueBadgeText=#eef2ff
// savedColors=Principal:#22c55e,Apoio:#a5b4fc

// @table user
// x=10
// y=20
// width=280
// useGroupStyle=true
// background=#ffffff
// border=#2563eb
// header=#dbeafe
// text=#111827
// line=#2563eb

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
// fromCardinality=one
// toCardinality=many
// via=(100,120),(200,120)

// @group backend
// label=Backend Core
// labelX=36
// labelY=44
// x=0
// y=0
// width=640
// height=320
// background=#0f766e
// border=#0f766e
// text=#fde68a
// opacity=0.14
// tableBackground=#052e2b
// tableBorder=#14b8a6
// tableHeader=#115e59
// tableText=#ccfbf1
// tableLine=#5eead4
// tableOpacity=0.88
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
    expect(diagram.visual.defaultTable.borderColor).toBe("#22c55e");
    expect(diagram.visual.defaultTable.lineColor).toBe("#38bdf8");
    expect(diagram.visual.badges.unique.borderColor).toBe("#a5b4fc");
    expect(diagram.visual.savedColors).toEqual([
      { name: "Principal", color: "#22c55e" },
      { name: "Apoio", color: "#a5b4fc" },
    ]);

    const user = diagram.tables.find((table) => table.id === "user");
    expect(user?.x).toBe(10);
    expect(user?.usesDefaultStyle).toBe(false);
    expect(user?.usesGroupStyle).toBe(true);
    expect(user?.visual.borderColor).toBe("#2563eb");
    expect(user?.visual.lineColor).toBe("#2563eb");
    expect(user?.columns[0].primaryKey).toBe(true);

    const project = diagram.tables.find((table) => table.id === "project");
    expect(project?.usesDefaultStyle).toBe(true);
    expect(project?.visual.borderColor).toBe("#22c55e");
    expect(project?.columns.find((column) => column.name === "user_id")?.foreignKey).toBe(true);

    expect(diagram.relations[0]).toMatchObject({
      fromTable: "project",
      fromColumn: "user_id",
      toTable: "user",
      toColumn: "id",
      fromCardinality: "one",
      toCardinality: "many",
      color: "#dc2626",
      usesTableLineColor: false,
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
      labelX: 36,
      labelY: 44,
      textColor: "#fde68a",
      opacity: 0.14,
      tableVisual: {
        backgroundColor: "#052e2b",
        borderColor: "#14b8a6",
        headerColor: "#115e59",
        textColor: "#ccfbf1",
        lineColor: "#5eead4",
        opacity: 0.88,
      },
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

  it("parses manual fk markers on columns", () => {
    const diagram = parseDbml(`Table invoice {
  id int [pk]
  customer_id int [fk, not null]
}`);

    const column = diagram.tables[0].columns.find((item) => item.name === "customer_id");

    expect(column?.foreignKey).toBe(true);
    expect(column?.nullable).toBe(false);
  });

  it("uses the source table line color mode for new plain relations", () => {
    const diagram = parseDbml(`Table user {
  id int [pk]
}

Table project {
  user_id int
}

Ref: project.user_id > user.id`);

    expect(diagram.relations[0].usesTableLineColor).toBe(true);
  });

  it("rejects unfinished DBML blocks", () => {
    expect(() => parseDbml(`Table broken {
  id int [pk]
`)).toThrow(/nao foi fechada/);
  });
});
