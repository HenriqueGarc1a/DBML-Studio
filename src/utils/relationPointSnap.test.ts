import { describe, expect, it } from "vitest";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { RelationModel, TableModel } from "../model/types";
import { getColumnPoint } from "./geometry";
import { snapRelationPointToTableExits } from "./relationPointSnap";

const source = table("source", 0, 80);
const target = table("target", 620, 80);
const relation: RelationModel = {
  id: "relation", fromTable: source.id, fromColumn: "fk", toTable: target.id, toColumn: "id",
  ...defaultRelationVisual, fromSide: "east", toSide: "west",
};

describe("relation point table-exit snap", () => {
  it("aligns a point to the exact row of the connected field before the grid", () => {
    const rowY = getColumnPoint(source, "fk", "east").y;
    const alignment = snapRelationPointToTableExits(
      relation, [source, target], { x: 410, y: rowY + 6 }, { x: 416, y: 192 }, 28, 10,
    );

    expect(alignment.point).toEqual({ x: 416, y: rowY });
    expect(alignment.horizontal?.tableId).toBe(source.id);
  });

  it("also aligns to the protected exit rail when the point comes close", () => {
    const endpoint = getColumnPoint(source, "fk", "east");
    const exitX = endpoint.x + 31;
    const alignment = snapRelationPointToTableExits(
      relation, [source, target], { x: exitX + 5, y: endpoint.y + 4 }, { x: 256, y: 192 }, 28, 10,
    );

    expect(alignment.point).toEqual({ x: exitX, y: endpoint.y });
    expect(alignment.vertical?.tableId).toBe(source.id);
  });

  it("keeps the ordinary grid fallback outside the magnetic range", () => {
    const alignment = snapRelationPointToTableExits(
      relation, [source, target], { x: 430, y: 310 }, { x: 416, y: 320 }, 28, 10,
    );

    expect(alignment.point).toEqual({ x: 416, y: 320 });
    expect(alignment.horizontal).toBeUndefined();
    expect(alignment.vertical).toBeUndefined();
  });
});

function table(id: string, x: number, y: number): TableModel {
  return {
    id, name: id, x, y, width: 220, height: 120,
    columns: [
      { id: `${id}-id`, name: "id", type: "int", nullable: false, primaryKey: true, foreignKey: false, rawSettings: [] },
      { id: `${id}-fk`, name: "fk", type: "int", nullable: false, primaryKey: false, foreignKey: true, rawSettings: [] },
    ],
    visual: defaultTableVisual, usesDefaultStyle: true, usesGroupStyle: false, indexes: [], layoutSource: "manual",
  };
}
