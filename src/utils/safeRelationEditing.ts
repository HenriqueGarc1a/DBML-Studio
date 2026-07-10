import type { Point, RelationModel, TableModel } from "../model/types";
import { moveRelationCorner, moveRelationSegment } from "./geometry";
import { relationKeepsTableMargin } from "./relationRouting";

export function snapSegmentEdit(
  relation: RelationModel,
  tables: TableModel[],
  sourcePoints: Point[],
  segmentIndex: number,
  desiredDelta: number,
  margin: number,
  step = 4,
): Point[] {
  const exact = moveRelationSegment(sourcePoints, segmentIndex, desiredDelta);
  if (isValid(relation, exact, tables, margin)) return exact;
  const increment = Math.max(4, step, Math.round(margin / 4));
  const maxDistance = Math.max(320, margin * 6);
  for (let distance = increment; distance <= maxDistance; distance += increment) {
    for (const delta of [desiredDelta - distance, desiredDelta + distance]) {
      const points = moveRelationSegment(sourcePoints, segmentIndex, delta);
      if (isValid(relation, points, tables, margin)) return points;
    }
  }
  return relation.viaPoints;
}

export function snapCornerEdit(
  relation: RelationModel,
  tables: TableModel[],
  sourcePoints: Point[],
  pointIndex: number,
  desired: Point,
  margin: number,
  step = 4,
): Point[] {
  const exact = moveRelationCorner(sourcePoints, pointIndex, desired);
  if (isValid(relation, exact, tables, margin)) return exact;
  const increment = Math.max(4, step, Math.round(margin / 4));
  const maxRadius = Math.max(240, margin * 5);
  for (let radius = increment; radius <= maxRadius; radius += increment) {
    for (const offset of ringOffsets(radius)) {
      const points = moveRelationCorner(sourcePoints, pointIndex, { x: desired.x + offset.x, y: desired.y + offset.y });
      if (isValid(relation, points, tables, margin)) return points;
    }
  }
  return relation.viaPoints;
}

function isValid(relation: RelationModel, viaPoints: Point[], tables: TableModel[], margin: number): boolean {
  return relationKeepsTableMargin({ ...relation, route: "orthogonal", viaPoints }, tables, margin);
}

function ringOffsets(radius: number): Point[] {
  return [
    { x: -radius, y: 0 }, { x: radius, y: 0 }, { x: 0, y: -radius }, { x: 0, y: radius },
    { x: -radius, y: -radius }, { x: radius, y: -radius }, { x: -radius, y: radius }, { x: radius, y: radius },
  ];
}
