import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT } from "../model/defaults";
import type { Direction, Point, RelationModel, TableModel } from "../model/types";
import { getVisualColumns } from "../model/tableColumns";
import { snapPoint } from "./grid";

export interface RelationGeometry {
  points: Point[];
  path: string;
  labelPoint: Point;
}

export function getTableBounds(tables: TableModel[]): { x: number; y: number; width: number; height: number } {
  if (!tables.length) {
    return { x: -120, y: -120, width: 1200, height: 800 };
  }

  const minX = Math.min(...tables.map((table) => table.x));
  const minY = Math.min(...tables.map((table) => table.y));
  const maxX = Math.max(...tables.map((table) => table.x + table.width));
  const maxY = Math.max(...tables.map((table) => table.y + table.height));

  return {
    x: minX - 180,
    y: minY - 160,
    width: Math.max(1200, maxX - minX + 360),
    height: Math.max(800, maxY - minY + 320),
  };
}

export function getColumnPoint(table: TableModel, columnName: string, side: Direction): Point {
  const columnIndex = Math.max(
    0,
    getVisualColumns(table).findIndex((column) => column.name === columnName),
  );
  const columnY = table.y + TABLE_HEADER_HEIGHT + columnIndex * TABLE_ROW_HEIGHT + TABLE_ROW_HEIGHT / 2;

  if (side === "west") return { x: table.x, y: columnY };
  return { x: table.x + table.width, y: columnY };
}

export function getRelationGeometry(
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
): RelationGeometry {
  const fromSide = normalizeRelationSide(relation.fromSide);
  const toSide = normalizeRelationSide(relation.toSide);
  const start = getColumnPoint(fromTable, relation.fromColumn, fromSide);
  const end = getColumnPoint(toTable, relation.toColumn, toSide);

  const points = relation.viaPoints.length
    ? orthogonalizePoints([start, ...relation.viaPoints, end])
    : orthogonalPoints(start, end);
  const path = polylinePath(points);
  const labelPoint = midpoint(points);

  return { points, path, labelPoint };
}

export function findViaInsertionIndex(
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
  point: Point,
): number {
  const checkpoints = [
    getColumnPoint(fromTable, relation.fromColumn, normalizeRelationSide(relation.fromSide)),
    ...relation.viaPoints,
    getColumnPoint(toTable, relation.toColumn, normalizeRelationSide(relation.toSide)),
  ];
  let best = { index: 0, distance: Number.POSITIVE_INFINITY };

  for (let index = 0; index < checkpoints.length - 1; index += 1) {
    const segmentPoints = orthogonalPoints(checkpoints[index], checkpoints[index + 1]);
    for (let segment = 0; segment < segmentPoints.length - 1; segment += 1) {
      const distance = distanceToSegment(point, segmentPoints[segment], segmentPoints[segment + 1]);
      if (distance < best.distance) best = { index, distance };
    }
  }
  return best.index;
}

export function nearestRelationSegment(points: Point[], point: Point): number {
  let best = { index: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(point, points[index], points[index + 1]);
    if (distance < best.distance) best = { index, distance };
  }
  return best.index;
}

export function shouldCreateLocalBend(points: Point[], segmentIndex: number, minLength = 96): boolean {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  return Boolean(a && b && Math.hypot(b.x - a.x, b.y - a.y) > minLength);
}

export function moveRelationSegment(points: Point[], segmentIndex: number, delta: number): Point[] {
  if (points.length < 2) return [];
  if (segmentIndex === 0 || segmentIndex === points.length - 2) {
    const a = points[segmentIndex];
    const b = points[segmentIndex + 1];
    return bendRelationSegment(points, segmentIndex, {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    }, delta);
  }
  const next = points.map((point) => ({ ...point }));
  const a = next[segmentIndex];
  const b = next[segmentIndex + 1];
  if (!a || !b) return next.slice(1, -1);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);

  if (horizontal) {
    if (segmentIndex > 0) a.y += delta;
    if (segmentIndex + 1 < next.length - 1) b.y += delta;
  } else {
    if (segmentIndex > 0) a.x += delta;
    if (segmentIndex + 1 < next.length - 1) b.x += delta;
  }
  return next.slice(1, -1);
}

export function moveRelationCorner(points: Point[], pointIndex: number, position: Point): Point[] {
  if (pointIndex <= 0 || pointIndex >= points.length - 1) return points.slice(1, -1);
  const next = points.map((point) => ({ ...point }));
  next[pointIndex] = position;
  return next.slice(1, -1);
}

export function bendRelationSegment(
  points: Point[],
  segmentIndex: number,
  anchor: Point,
  delta: number,
  halfWidth = 28,
): Point[] {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return points.slice(1, -1);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const replacement: Point[] = [];

  if (horizontal) {
    const min = Math.min(a.x, b.x);
    const max = Math.max(a.x, b.x);
    const center = clamp(anchor.x, min, max);
    const left = Math.max(min, center - halfWidth);
    const right = Math.min(max, center + halfWidth);
    const first = a.x <= b.x ? left : right;
    const second = a.x <= b.x ? right : left;
    replacement.push(
      { x: first, y: a.y },
      { x: first, y: a.y + delta },
      { x: second, y: a.y + delta },
      { x: second, y: b.y },
    );
  } else {
    const min = Math.min(a.y, b.y);
    const max = Math.max(a.y, b.y);
    const center = clamp(anchor.y, min, max);
    const top = Math.max(min, center - halfWidth);
    const bottom = Math.min(max, center + halfWidth);
    const first = a.y <= b.y ? top : bottom;
    const second = a.y <= b.y ? bottom : top;
    replacement.push(
      { x: a.x, y: first },
      { x: a.x + delta, y: first },
      { x: a.x + delta, y: second },
      { x: b.x, y: second },
    );
  }

  return simplifyPoints([
    ...points.slice(0, segmentIndex + 1),
    ...replacement,
    ...points.slice(segmentIndex + 1),
  ]).slice(1, -1);
}

export function sideForPoint(table: TableModel, point: Point): Direction {
  return point.x < table.x + table.width / 2 ? "west" : "east";
}

export function snapRelationEndpoint(
  table: TableModel,
  columnName: string,
  point: Point,
  _snapToGrid: boolean,
  _gridSize?: number,
): {
  side: Direction;
  point: Point;
} {
  const side = sideForPoint(table, point);
  const anchor = getColumnPoint(table, columnName, side);

  return {
    side,
    point: anchor,
  };
}

export function snapRelationViaPoint(
  relation: RelationModel,
  viaPointIndex: number,
  point: Point,
  fromTable: TableModel,
  toTable: TableModel,
  snapToGrid: boolean,
  gridSize: number,
): Point {
  const snapped = snapPoint(point, snapToGrid, gridSize);
  if (!snapToGrid) return snapped;

  const fromSide = normalizeRelationSide(relation.fromSide);
  const toSide = normalizeRelationSide(relation.toSide);
  const anchors: number[] = [];

  if (viaPointIndex === 0) {
    anchors.push(getColumnPoint(fromTable, relation.fromColumn, fromSide).y);
  }

  if (viaPointIndex === relation.viaPoints.length - 1) {
    anchors.push(getColumnPoint(toTable, relation.toColumn, toSide).y);
  }

  const threshold = Math.max(6, gridSize / 2);
  const bestAnchor = anchors
    .map((y) => ({ y, distance: Math.min(Math.abs(point.y - y), Math.abs(snapped.y - y)) }))
    .filter((anchor) => anchor.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)[0];

  return bestAnchor ? { ...snapped, y: bestAnchor.y } : snapped;
}

export function normalizeRelationSide(side: Direction): Direction {
  return side === "west" ? "west" : "east";
}

function orthogonalPoints(start: Point, end: Point): Point[] {
  const midX = (start.x + end.x) / 2;
  return simplifyPoints([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
}

function polylinePath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function orthogonalizePoints(points: Point[]): Point[] {
  if (points.length <= 1) return points;

  const result: Point[] = [points[0]];

  for (const next of points.slice(1)) {
    const current = result[result.length - 1];

    if (current.x !== next.x && current.y !== next.y) {
      result.push({ x: next.x, y: current.y });
    }

    result.push(next);
  }

  return simplifyPoints(result);
}

function simplifyPoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];

    if (previous && previous.x === point.x && previous.y === point.y) return false;
    if (!previous || !next) return true;

    const horizontal = previous.y === point.y && point.y === next.y;
    const vertical = previous.x === point.x && point.x === next.x;
    return !horizontal && !vertical;
  });
}

function midpoint(points: Point[]): Point {
  const middle = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[middle];

  const before = points[middle - 1];
  const after = points[middle];
  return { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
