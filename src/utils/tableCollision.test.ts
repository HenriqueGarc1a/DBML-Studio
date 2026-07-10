import { describe, expect, it } from "vitest";
import { defaultTableVisual } from "../model/defaults";
import type { TableModel } from "../model/types";
import { nearestNonOverlappingPosition, TABLE_GAP, tablesOverlap } from "./tableCollision";

describe("table collision", () => {
  it("keeps a free table where the user dropped it", () => {
    const table = makeTable("moving", 400, 200);
    expect(nearestNonOverlappingPosition(table, [table, makeTable("other", 0, 0)])).toEqual({ x: 400, y: 200 });
  });

  it("moves an overlapping table to the nearest free position on drop", () => {
    const other = makeTable("other", 100, 100);
    const moving = makeTable("moving", 150, 130);
    const position = nearestNonOverlappingPosition(moving, [other, moving]);
    const settled = { ...moving, ...position };

    expect(position).not.toEqual({ x: moving.x, y: moving.y });
    expect(tablesOverlap(settled, other, TABLE_GAP)).toBe(false);
  });

  it("finds a position clear of several tables", () => {
    const moving = makeTable("moving", 120, 120);
    const others = [makeTable("a", 100, 100), makeTable("b", 316, 100), makeTable("c", 100, 236)];
    const settled = { ...moving, ...nearestNonOverlappingPosition(moving, [moving, ...others]) };
    expect(others.every((other) => !tablesOverlap(settled, other, TABLE_GAP))).toBe(true);
  });
});

function makeTable(id: string, x: number, y: number): TableModel {
  return {
    id, name: id, x, y, width: 200, height: 120, columns: [], visual: defaultTableVisual,
    usesDefaultStyle: true, usesGroupStyle: false, indexes: [], layoutSource: "manual",
  };
}
