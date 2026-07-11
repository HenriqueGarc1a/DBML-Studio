import { describe, expect, it } from "vitest";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { RelationModel, TableModel } from "../model/types";
import { relationKeepsTableMargin } from "./relationRouting";
import { resolveSafeCornerEdit, resolveSafeSegmentEdit, snapCornerEdit, snapSegmentEdit } from "./safeRelationEditing";

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

  it("keeps fractional pointer movement continuous while the grid is enabled elsewhere", () => {
    const result = resolveSafeSegmentEdit({
      relation, tables, sourcePoints: geometry, segmentIndex: 2,
      anchor: { x: 450, y: 0 }, desiredDelta: -13.75, margin: 28, mode: "move",
    });

    expect(result.constrained).toBe(false);
    expect(result.resolvedDelta).toBe(-13.75);
  });

  it("reports the blocking table and projects to the nearest safe axis position", () => {
    const result = resolveSafeSegmentEdit({
      relation, tables, sourcePoints: geometry, segmentIndex: 2,
      anchor: { x: 450, y: 0 }, desiredDelta: 100, margin: 28, mode: "move",
    });

    expect(result.constrained).toBe(true);
    expect(result.blockingTableIds).toContain("blocker");
    expect(Math.abs(result.resolvedDelta - result.desiredDelta)).toBeLessThan(100);
    expect(relationKeepsTableMargin({ ...relation, viaPoints: result.viaPoints }, tables, 28)).toBe(true);
  });

  it("creates a safe local bend centered at the exact grab position", () => {
    const result = resolveSafeSegmentEdit({
      relation, tables, sourcePoints: geometry, segmentIndex: 2,
      anchor: { x: 380, y: 0 }, desiredDelta: -48, margin: 28, mode: "bend",
    });
    const bendXs = result.viaPoints.filter((point) => point.y === -48).map((point) => point.x);

    expect(result.constrained).toBe(false);
    expect(Math.min(...bendXs)).toBeLessThan(380);
    expect(Math.max(...bendXs)).toBeGreaterThan(380);
    expect(relationKeepsTableMargin({ ...relation, viaPoints: result.viaPoints }, tables, 28)).toBe(true);
  });

  it("moves a curve point freely in two dimensions when the position is safe", () => {
    const result = resolveSafeCornerEdit({
      relation, tables, sourcePoints: geometry, pointIndex: 2,
      desired: { x: 265, y: -40 }, previousPosition: geometry[2], margin: 28,
    });

    expect(result.constrained).toBe(false);
    expect(result.resolved).toEqual({ x: 265, y: -40 });
    expect(result.viaPoints).toContainEqual({ x: 265, y: -40 });
    expect(relationKeepsTableMargin({ ...relation, viaPoints: result.viaPoints }, tables, 28)).toBe(true);
  });

  it("keeps a dragged curve point at the nearest safe position and reports the obstacle", () => {
    const result = resolveSafeCornerEdit({
      relation, tables, sourcePoints: geometry, pointIndex: 2,
      desired: { x: 400, y: 100 }, previousPosition: geometry[2], margin: 28,
    });

    expect(result.constrained).toBe(true);
    expect(result.blockingTableIds).toContain("blocker");
    expect(result.resolved).not.toEqual(result.desired);
    expect(relationKeepsTableMargin({ ...relation, viaPoints: result.viaPoints }, tables, 28)).toBe(true);
  });
});

function table(id: string, x: number, y: number, width = 220, height = 120): TableModel {
  return {
    id, name: id, x, y, width, height, columns: [{ id: `${id}-id`, name: "id", type: "int", nullable: false, primaryKey: true, foreignKey: false, rawSettings: [] }],
    visual: defaultTableVisual, usesDefaultStyle: true, usesGroupStyle: false, indexes: [], layoutSource: "manual",
  };
}
