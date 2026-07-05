import { describe, expect, it } from "vitest";
import { defaultRelationVisual } from "../model/defaults";
import type { RelationModel, TableModel } from "../model/types";
import { getRelationGeometry, snapRelationEndpoint, snapRelationViaPoint } from "./geometry";

const table: TableModel = {
  id: "user",
  name: "user",
  columns: [
    {
      id: "column-user-id-0",
      name: "id",
      type: "int",
      nullable: false,
      primaryKey: true,
      foreignKey: false,
      rawSettings: [],
    },
  ],
  x: 100,
  y: 80,
  width: 240,
  height: 160,
  visual: {
    backgroundColor: "#ffffff",
    borderColor: "#64748b",
    textColor: "#172033",
    headerColor: "#dbeafe",
    lineColor: "#64748b",
    opacity: 1,
  },
  usesDefaultStyle: false,
  usesGroupStyle: false,
  indexes: [],
  layoutSource: "manual",
};

describe("relation endpoint snapping", () => {
  it("projects a dragged endpoint onto the nearest table side", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 60, y: 143 }, true);

    expect(endpoint.side).toBe("west");
    expect(endpoint.point).toEqual({ x: 100, y: 132 });
    expect(endpoint.offsetX).toBe(0);
    expect(endpoint.offsetY).toBe(0);
  });

  it("keeps endpoints anchored to the relation column row", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 210, y: 20 }, true);

    expect(endpoint.side).toBe("west");
    expect(endpoint.point).toEqual({ x: 100, y: 132 });
    expect(endpoint.offsetY).toBe(0);
  });

  it("chooses the right table side when dragged near the right edge", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 380, y: 999 }, true);

    expect(endpoint.side).toBe("east");
    expect(endpoint.point).toEqual({ x: 340, y: 132 });
  });
});

describe("relation geometry", () => {
  it("anchors relations at the middle of the referenced column row", () => {
    const target = { ...table, id: "account", name: "account", x: 520 };
    const relation = {
      ...makeRelation(),
      startOffsetX: 40,
      startOffsetY: -20,
      endOffsetX: -20,
      endOffsetY: 40,
    };
    const geometry = getRelationGeometry(relation, table, target);

    expect(geometry.points[0]).toEqual({ x: 340, y: 132 });
    expect(geometry.points[geometry.points.length - 1]).toEqual({ x: 520, y: 132 });
  });

  it("orthogonalizes saved via points so every segment follows the grid", () => {
    const target = { ...table, id: "account", name: "account", x: 520 };
    const relation = {
      ...makeRelation(),
      viaPoints: [{ x: 420, y: 220 }],
    };
    const geometry = getRelationGeometry(relation, table, target);

    for (let index = 0; index < geometry.points.length - 1; index += 1) {
      const current = geometry.points[index];
      const next = geometry.points[index + 1];
      expect(current.x === next.x || current.y === next.y).toBe(true);
    }
  });

  it("snaps the last via point to the target column row when grid snap is enabled", () => {
    const target = { ...table, id: "account", name: "account", x: 520 };
    const relation = {
      ...makeRelation(),
      viaPoints: [
        { x: 400, y: 96 },
        { x: 460, y: 140 },
      ],
    };

    expect(
      snapRelationViaPoint(relation, 1, { x: 460, y: 140 }, table, target, true, 32),
    ).toEqual({ x: 448, y: 132 });
  });

  it("does not apply column-row snapping when grid snap is disabled", () => {
    const target = { ...table, id: "account", name: "account", x: 520 };
    const relation = {
      ...makeRelation(),
      viaPoints: [{ x: 460, y: 140 }],
    };

    expect(
      snapRelationViaPoint(relation, 0, { x: 460, y: 140 }, table, target, false, 32),
    ).toEqual({ x: 460, y: 140 });
  });
});

function makeRelation(): RelationModel {
  return {
    id: "relation-user-account",
    fromTable: "user",
    fromColumn: "id",
    toTable: "account",
    toColumn: "id",
    ...defaultRelationVisual,
    fromSide: "east",
    toSide: "west",
  };
}
