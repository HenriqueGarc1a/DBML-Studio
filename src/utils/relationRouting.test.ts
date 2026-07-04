import { describe, expect, it } from "vitest";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { Point, RelationModel, TableModel } from "../model/types";
import { getColumnPoint } from "./geometry";
import { organizeRelationRoute, routeRelationAroundTables } from "./relationRouting";

const source = makeTable("orders", 40, 80);
const target = makeTable("users", 620, 80);
const lowerTarget = makeTable("profiles", 40, 380);
const blocker = makeTable("audit", 330, 58, 160, 160);

const relation: RelationModel = {
  id: "relation-orders-user",
  fromTable: "orders",
  fromColumn: "user_id",
  toTable: "users",
  toColumn: "id",
  ...defaultRelationVisual,
  fromSide: "east",
  toSide: "west",
};

describe("relation routing", () => {
  it("routes organized relations around tables between endpoints", () => {
    const viaPoints = routeRelationAroundTables(relation, source, target, [source, target, blocker], "east", "west");
    const points = [
      getColumnPoint(source, relation.fromColumn, "east"),
      ...viaPoints,
      getColumnPoint(target, relation.toColumn, "west"),
    ];

    expect(viaPoints.length).toBeGreaterThan(2);
    for (let index = 0; index < points.length - 1; index += 1) {
      expect(segmentCrossesTable(points[index], points[index + 1], blocker)).toBe(false);
    }
  });

  it("chooses a clean side pair when organizing a relation", () => {
    const route = organizeRelationRoute(relation, source, target, [source, target, blocker], "east", "west");
    const points = [
      getColumnPoint(source, relation.fromColumn, route.fromSide),
      ...route.viaPoints,
      getColumnPoint(target, relation.toColumn, route.toSide),
    ];

    for (const table of [source, target, blocker]) {
      for (let index = 0; index < points.length - 1; index += 1) {
        expect(segmentCrossesTable(points[index], points[index + 1], table)).toBe(false);
      }
    }
  });

  it("prefers table lateral sides when organizing routes", () => {
    const route = organizeRelationRoute(relation, source, lowerTarget, [source, lowerTarget], "south", "north");

    expect(["east", "west"]).toContain(route.fromSide);
    expect(["east", "west"]).toContain(route.toSide);
  });
});

function makeTable(id: string, x: number, y: number, width = 220, height = 120): TableModel {
  return {
    id,
    name: id,
    columns: [
      {
        id: `column-${id}-id`,
        name: "id",
        type: "int",
        nullable: false,
        primaryKey: true,
        foreignKey: false,
        rawSettings: [],
      },
      {
        id: `column-${id}-user-id`,
        name: "user_id",
        type: "int",
        nullable: false,
        primaryKey: false,
        foreignKey: true,
        rawSettings: [],
      },
    ],
    x,
    y,
    width,
    height,
    visual: defaultTableVisual,
    usesDefaultStyle: true,
    usesGroupStyle: false,
    indexes: [],
    layoutSource: "manual",
  };
}

function segmentCrossesTable(a: Point, b: Point, table: TableModel): boolean {
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x > table.x && a.x < table.x + table.width && minY < table.y + table.height && maxY > table.y;
  }

  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y > table.y && a.y < table.y + table.height && minX < table.x + table.width && maxX > table.x;
  }

  return false;
}
