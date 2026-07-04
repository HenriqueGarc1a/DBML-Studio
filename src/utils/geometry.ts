import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT } from "../model/defaults";
import type { Direction, Point, RelationModel, TableModel } from "../model/types";
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
    table.columns.findIndex((column) => column.name === columnName),
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

export function sideForPoint(table: TableModel, point: Point): Direction {
  return point.x < table.x + table.width / 2 ? "west" : "east";
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
  const anchor = getColumnPoint(table, columnName, side);

  return {
    side,
    point: anchor,
    offsetX: 0,
    offsetY: 0,
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
