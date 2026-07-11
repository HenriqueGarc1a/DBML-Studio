import { describe, expect, it } from "vitest";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { Point, RelationModel, TableModel } from "../model/types";
import { getColumnPoint } from "./geometry";
import { organizeRelationRoute, pathHasSelfIntersection, relationKeepsTableMargin, routeRelationAroundTables, TABLE_ROUTE_MARGIN } from "./relationRouting";

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
      expect(segmentCrossesTable(points[index], points[index + 1], expandTable(blocker, TABLE_ROUTE_MARGIN))).toBe(false);
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

  it("rejects a manual route that a user drags through a table margin", () => {
    const blocked = {
      ...relation,
      viaPoints: [
        { x: blocker.x + 20, y: blocker.y + 20 },
        { x: blocker.x + 80, y: blocker.y + 20 },
      ],
    };
    expect(relationKeepsTableMargin(blocked, [source, target, blocker])).toBe(false);

    const organized = organizeRelationRoute(blocked, source, target, [source, target, blocker], "east", "west");
    expect(relationKeepsTableMargin({ ...blocked, ...organized }, [source, target, blocker])).toBe(true);
  });

  it("rejects routes that cross or overlap themselves", () => {
    expect(pathHasSelfIntersection([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 40, y: 100 },
      { x: 40, y: -40 },
    ])).toBe(true);
    expect(pathHasSelfIntersection([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 160, y: 100 },
    ])).toBe(false);
  });

  it("rejects a manual route that exits through the inside of its own table", () => {
    const malformed = {
      ...relation,
      viaPoints: [
        { x: source.x - 60, y: 132 },
        { x: source.x - 60, y: 0 },
        { x: target.x - 40, y: 0 },
        { x: target.x - 40, y: 132 },
      ],
    };

    expect(relationKeepsTableMargin(malformed, [source, target, blocker])).toBe(false);
  });

  it("includes half the stroke width in the protected table margin", () => {
    const thick = {
      ...relation,
      strokeWidth: 20,
      viaPoints: [
        { x: 280, y: blocker.y - TABLE_ROUTE_MARGIN },
        { x: 540, y: blocker.y - TABLE_ROUTE_MARGIN },
      ],
    };
    expect(relationKeepsTableMargin(thick, [source, target, blocker], TABLE_ROUTE_MARGIN)).toBe(false);
    const organized = organizeRelationRoute(thick, source, target, [source, target, blocker], "east", "west", TABLE_ROUTE_MARGIN);
    expect(relationKeepsTableMargin({ ...thick, ...organized }, [source, target, blocker], TABLE_ROUTE_MARGIN)).toBe(true);
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

function expandTable(table: TableModel, margin: number): TableModel {
  return {
    ...table,
    x: table.x - margin,
    y: table.y - margin,
    width: table.width + margin * 2,
    height: table.height + margin * 2,
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
