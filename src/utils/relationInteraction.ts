import type { Point } from "../model/types";
import type { RelationSegmentEditMode } from "./safeRelationEditing";

const MIN_SEGMENT_LENGTH = 24;
const MIN_TERMINAL_BEND_LENGTH = 88;
const MIN_LOCAL_BEND_LENGTH = 112;
const BEND_EDGE_CLEARANCE = 36;

export type SegmentOrientation = "horizontal" | "vertical";

export function relationSegmentOrientation(points: Point[], segmentIndex: number): SegmentOrientation {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  return a && b && Math.abs(b.x - a.x) < Math.abs(b.y - a.y) ? "vertical" : "horizontal";
}

export function relationSegmentLength(points: Point[], segmentIndex: number): number {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

export function insertRelationMidpoint(points: Point[], segmentIndex: number): {
  points: Point[];
  point: Point;
  pointIndex: number;
} | undefined {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return undefined;
  const point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const pointIndex = segmentIndex + 1;
  return {
    points: [...points.slice(0, pointIndex), point, ...points.slice(pointIndex)],
    point,
    pointIndex,
  };
}

export function isEditableRelationSegment(points: Point[], segmentIndex: number): boolean {
  const length = relationSegmentLength(points, segmentIndex);
  const terminal = segmentIndex === 0 || segmentIndex === points.length - 2;
  return terminal ? length >= MIN_TERMINAL_BEND_LENGTH : length >= MIN_SEGMENT_LENGTH;
}

export function projectPointToRelationSegment(points: Point[], segmentIndex: number, point: Point): Point {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return point;

  if (relationSegmentOrientation(points, segmentIndex) === "horizontal") {
    return { x: clamp(point.x, Math.min(a.x, b.x), Math.max(a.x, b.x)), y: a.y };
  }

  return { x: a.x, y: clamp(point.y, Math.min(a.y, b.y), Math.max(a.y, b.y)) };
}

export function chooseRelationSegmentEditMode(
  points: Point[],
  segmentIndex: number,
  anchor: Point,
  fromHandle: boolean,
): RelationSegmentEditMode {
  const terminal = segmentIndex === 0 || segmentIndex === points.length - 2;
  if (fromHandle && !terminal) return "move";
  if (terminal) return "bend";

  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b || relationSegmentLength(points, segmentIndex) < MIN_LOCAL_BEND_LENGTH) return "move";

  const distanceToA = Math.hypot(anchor.x - a.x, anchor.y - a.y);
  const distanceToB = Math.hypot(anchor.x - b.x, anchor.y - b.y);
  return distanceToA >= BEND_EDGE_CLEARANCE && distanceToB >= BEND_EDGE_CLEARANCE ? "bend" : "move";
}

export function relationSegmentDelta(
  orientation: SegmentOrientation,
  start: Point,
  current: Point,
): number {
  return orientation === "horizontal" ? current.y - start.y : current.x - start.x;
}

export function snapRelationSegmentDelta(
  points: Point[],
  segmentIndex: number,
  desiredDelta: number,
  gridSize: number,
): number {
  const a = points[segmentIndex];
  if (!a || gridSize <= 0) return desiredDelta;
  const coordinate = relationSegmentOrientation(points, segmentIndex) === "horizontal" ? a.y : a.x;
  return Math.round((coordinate + desiredDelta) / gridSize) * gridSize - coordinate;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
