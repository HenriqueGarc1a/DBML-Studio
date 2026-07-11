import { describe, expect, it } from "vitest";
import {
  chooseRelationSegmentEditMode,
  insertRelationMidpoint,
  isEditableRelationSegment,
  projectPointToRelationSegment,
  relationSegmentDelta,
  snapRelationSegmentDelta,
} from "./relationInteraction";

describe("relation pointer interaction", () => {
  const points = [
    { x: 100, y: 100 }, { x: 180, y: 100 }, { x: 180, y: 260 },
    { x: 500, y: 260 }, { x: 500, y: 100 }, { x: 580, y: 100 },
  ];

  it("moves horizontal and vertical segments only on the perpendicular axis", () => {
    expect(relationSegmentDelta("horizontal", { x: 300, y: 260 }, { x: 900, y: 277.5 })).toBe(17.5);
    expect(relationSegmentDelta("vertical", { x: 180, y: 180 }, { x: 193.25, y: 900 })).toBe(13.25);
  });

  it("projects the grab exactly onto the selected segment", () => {
    expect(projectPointToRelationSegment(points, 2, { x: 310, y: 900 })).toEqual({ x: 310, y: 260 });
    expect(projectPointToRelationSegment(points, 1, { x: 900, y: 170 })).toEqual({ x: 180, y: 170 });
  });

  it("turns a segment midpoint into a new freely movable anchor", () => {
    const insertion = insertRelationMidpoint(points, 2);
    expect(insertion?.point).toEqual({ x: 340, y: 260 });
    expect(insertion?.pointIndex).toBe(3);
    expect(insertion?.points).toHaveLength(points.length + 1);
  });

  it("uses midpoint controls to move internal segments and to bend anchored terminal segments", () => {
    expect(chooseRelationSegmentEditMode(points, 2, { x: 340, y: 260 }, true)).toBe("move");
    expect(chooseRelationSegmentEditMode([{ x: 0, y: 0 }, { x: 140, y: 0 }], 0, { x: 70, y: 0 }, true)).toBe("bend");
  });

  it("does not expose short protected endpoint stubs as draggable", () => {
    const shortStub = [{ x: 100, y: 100 }, { x: 132, y: 100 }, { x: 132, y: 220 }];
    expect(isEditableRelationSegment(shortStub, 0)).toBe(false);
    expect(isEditableRelationSegment(points, 0)).toBe(false);
    expect(isEditableRelationSegment([{ x: 0, y: 0 }, { x: 140, y: 0 }], 0)).toBe(true);
  });

  it("aligns the absolute segment coordinate to the grid only on commit", () => {
    expect(snapRelationSegmentDelta(points, 2, 19, 32)).toBe(28);
  });
});
