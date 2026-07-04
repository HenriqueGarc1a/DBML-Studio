import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT } from "../model/defaults";
import type { Direction, Point, RelationModel, TableModel } from "../model/types";
import { snapValue } from "./grid";

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
    table.columns.findIndex((column) => column.name === columnName),
  );
  const columnY = table.y + TABLE_HEADER_HEIGHT + columnIndex * TABLE_ROW_HEIGHT + TABLE_ROW_HEIGHT / 2;

  if (side === "north") return { x: table.x + table.width / 2, y: table.y };
  if (side === "south") return { x: table.x + table.width / 2, y: table.y + table.height };
  if (side === "west") return { x: table.x, y: columnY };
  return { x: table.x + table.width, y: columnY };
}

export function getRelationGeometry(
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
): RelationGeometry {
  const start = applyOffset(
    getColumnPoint(fromTable, relation.fromColumn, relation.fromSide),
    relation.startOffsetX,
    relation.startOffsetY,
  );
  const end = applyOffset(
    getColumnPoint(toTable, relation.toColumn, relation.toSide),
    relation.endOffsetX,
    relation.endOffsetY,
  );

  const points = relation.route === "orthogonal" && relation.viaPoints.length === 0
    ? orthogonalPoints(start, end, relation.fromSide, relation.toSide)
    : [start, ...relation.viaPoints, end];

  const path = relation.route === "curve"
    ? curvePath(start, end, relation.viaPoints)
    : polylinePath(points);
  const labelPoint = midpoint(points);

  return { points, path, labelPoint };
}

export function sideForPoint(table: TableModel, point: Point): Direction {
  const right = table.x + table.width;
  const bottom = table.y + table.height;
  const distances: Array<[Direction, number]> = [
    ["north", distanceToSegment(point, { x: table.x, y: table.y }, { x: right, y: table.y })],
    ["south", distanceToSegment(point, { x: table.x, y: bottom }, { x: right, y: bottom })],
    ["west", distanceToSegment(point, { x: table.x, y: table.y }, { x: table.x, y: bottom })],
    ["east", distanceToSegment(point, { x: right, y: table.y }, { x: right, y: bottom })],
  ];

  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

export function snapRelationEndpoint(
  table: TableModel,
  columnName: string,
  point: Point,
  snapToGrid: boolean,
  gridSize?: number,
): {
  side: Direction;
  point: Point;
  offsetX: number;
  offsetY: number;
} {
  const side = sideForPoint(table, point);
  const projected = projectPointToTableSide(table, point, side, snapToGrid, gridSize);
  const anchor = getColumnPoint(table, columnName, side);

  return {
    side,
    point: projected,
    offsetX: projected.x - anchor.x,
    offsetY: projected.y - anchor.y,
  };
}

export function pointOffsetForSide(table: TableModel, point: Point, side: Direction): Point {
  const anchor = side === "north"
    ? { x: table.x + table.width / 2, y: table.y }
    : side === "south"
      ? { x: table.x + table.width / 2, y: table.y + table.height }
      : side === "west"
        ? { x: table.x, y: point.y }
        : { x: table.x + table.width, y: point.y };

  return { x: point.x - anchor.x, y: point.y - anchor.y };
}

function projectPointToTableSide(
  table: TableModel,
  point: Point,
  side: Direction,
  shouldSnap: boolean,
  gridSize?: number,
): Point {
  if (side === "north" || side === "south") {
    const x = shouldSnap ? snapValue(point.x, gridSize) : point.x;
    return {
      x: clamp(x, table.x, table.x + table.width),
      y: side === "north" ? table.y : table.y + table.height,
    };
  }

  const y = shouldSnap ? snapValue(point.y, gridSize) : point.y;
  return {
    x: side === "west" ? table.x : table.x + table.width,
    y: clamp(y, table.y, table.y + table.height),
  };
}

function applyOffset(point: Point, offsetX: number, offsetY: number): Point {
  return { x: point.x + offsetX, y: point.y + offsetY };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

function orthogonalPoints(start: Point, end: Point, fromSide: Direction, toSide: Direction): Point[] {
  if ((fromSide === "east" || fromSide === "west") && (toSide === "east" || toSide === "west")) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function polylinePath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function curvePath(start: Point, end: Point, viaPoints: Point[]): string {
  if (viaPoints.length) {
    return polylinePath([start, ...viaPoints, end]);
  }

  const dx = Math.max(80, Math.abs(end.x - start.x) * 0.5);
  const c1 = { x: start.x + dx, y: start.y };
  const c2 = { x: end.x - dx, y: end.y };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function midpoint(points: Point[]): Point {
  const middle = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[middle];

  const before = points[middle - 1];
  const after = points[middle];
  return { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
}
