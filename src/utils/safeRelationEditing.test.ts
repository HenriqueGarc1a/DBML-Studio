import { describe, expect, it } from "vitest";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { RelationModel, TableModel } from "../model/types";
import { relationKeepsTableMargin } from "./relationRouting";
import { snapCornerEdit, snapSegmentEdit } from "./safeRelationEditing";

const source = table("source", 0, 80);
const target = table("target", 620, 80);
const blocker = table("blocker", 300, 40, 180, 180);
const tables = [source, target, blocker];
const relation: RelationModel = {
  id: "relation", fromTable: source.id, fromColumn: "id", toTable: target.id, toColumn: "id",
  ...defaultRelationVisual, fromSide: "east", toSide: "west",
  viaPoints: [{ x: 260, y: 132 }, { x: 260, y: 0 }, { x: 580, y: 0 }, { x: 580, y: 132 }],
};
const geometry = [{ x: 220, y: 132 }, ...relation.viaPoints, { x: 620, y: 132 }];

describe("safe relation editing", () => {
  it("snaps a dragged corner to the closest nearby valid geometry", () => {
    const viaPoints = snapCornerEdit(relation, tables, geometry, 2, { x: 330, y: 80 }, 28, 4);
    expect(relationKeepsTableMargin({ ...relation, viaPoints }, tables, 28)).toBe(true);
    expect(viaPoints).not.toEqual(relation.viaPoints);
  });

  it("keeps segment edits safe instead of resetting the whole route", () => {
    const viaPoints = snapSegmentEdit(relation, tables, geometry, 2, 100, 28, 4);
    expect(relationKeepsTableMargin({ ...relation, viaPoints }, tables, 28)).toBe(true);
  });
});

function table(id: string, x: number, y: number, width = 220, height = 120): TableModel {
  return {
    id, name: id, x, y, width, height, columns: [{ id: `${id}-id`, name: "id", type: "int", nullable: false, primaryKey: true, foreignKey: false, rawSettings: [] }],
    visual: defaultTableVisual, usesDefaultStyle: true, usesGroupStyle: false, indexes: [], layoutSource: "manual",
  };
}
