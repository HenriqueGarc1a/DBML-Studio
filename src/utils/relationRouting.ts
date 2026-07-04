import type { Direction, Point, RelationModel, TableModel } from "../model/types";
import { getColumnPoint } from "./geometry";

interface Obstacle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const OBSTACLE_PADDING = 18;
const EXIT_DISTANCE = 32;
const OUTER_RAIL_PADDING = 56;
const BEND_PENALTY = 90;
const SIDE_PREFERENCE_PENALTY = 45;
const LATERAL_SIDES: Direction[] = ["east", "west"];
const ALL_SIDES: Direction[] = ["east", "west", "south", "north"];

export interface OrganizedRelationRoute {
  fromSide: Direction;
  toSide: Direction;
  viaPoints: Point[];
}

export function organizeRelationRoute(
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
  tables: TableModel[],
  preferredFromSide: Direction,
  preferredToSide: Direction,
): OrganizedRelationRoute {
  const lateralCandidates = rankSidePairs(
    preferredLateralPairs(fromTable, toTable),
    relation,
    fromTable,
    toTable,
    tables,
  );
  const candidates = lateralCandidates.length
    ? lateralCandidates
    : rankSidePairs(
        [
          [preferredFromSide, preferredToSide],
          ...ALL_SIDES.flatMap((fromSide) => ALL_SIDES.map((toSide): [Direction, Direction] => [fromSide, toSide])),
        ],
        relation,
        fromTable,
        toTable,
        tables,
      );

  if (candidates[0]) {
    return {
      fromSide: candidates[0].fromSide,
      toSide: candidates[0].toSide,
      viaPoints: candidates[0].viaPoints,
    };
  }

  return {
    fromSide: preferredFromSide,
    toSide: preferredToSide,
    viaPoints: routeRelationAroundTables(relation, fromTable, toTable, tables, preferredFromSide, preferredToSide),
  };
}

function rankSidePairs(
  sidePairs: Array<[Direction, Direction]>,
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
  tables: TableModel[],
): Array<OrganizedRelationRoute & { score: number }> {
  return uniqueSidePairs(sidePairs)
    .map(([fromSide, toSide], index) => {
      const viaPoints = routeRelationAroundTables(relation, fromTable, toTable, tables, fromSide, toSide);
      const points = [
        getColumnPoint(fromTable, relation.fromColumn, fromSide),
        ...viaPoints,
        getColumnPoint(toTable, relation.toColumn, toSide),
      ];

      return {
        fromSide,
        toSide,
        viaPoints,
        clear: !pathCrossesTables(points, tables),
        score: routeScore(points, points[0], points[points.length - 1]) + index * SIDE_PREFERENCE_PENALTY,
      };
    })
    .filter((candidate) => candidate.clear)
    .sort((a, b) => a.score - b.score);
}

function preferredLateralPairs(fromTable: TableModel, toTable: TableModel): Array<[Direction, Direction]> {
  const fromCenterX = fromTable.x + fromTable.width / 2;
  const toCenterX = toTable.x + toTable.width / 2;
  const natural: [Direction, Direction] = toCenterX >= fromCenterX ? ["east", "west"] : ["west", "east"];

  return [
    natural,
    ...LATERAL_SIDES.flatMap((fromSide) =>
      LATERAL_SIDES.map((toSide): [Direction, Direction] => [fromSide, toSide]),
    ),
  ];
}

export function routeRelationAroundTables(
  relation: RelationModel,
  fromTable: TableModel,
  toTable: TableModel,
  tables: TableModel[],
  fromSide: Direction,
  toSide: Direction,
): Point[] {
  const start = getColumnPoint(fromTable, relation.fromColumn, fromSide);
  const end = getColumnPoint(toTable, relation.toColumn, toSide);
  const startExit = offsetFromSide(start, fromSide, EXIT_DISTANCE);
  const endExit = offsetFromSide(end, toSide, EXIT_DISTANCE);
  const obstacles = tables.map((table) => tableToObstacle(table, OBSTACLE_PADDING));
  const route = pickBestRoute(startExit, endExit, obstacles);

  return simplifyPoints([startExit, ...route.slice(1, -1), endExit]);
}

function pickBestRoute(start: Point, end: Point, obstacles: Obstacle[]): Point[] {
  const bounds = routeBounds(start, end, obstacles);
  const midX = roundHalf((start.x + end.x) / 2);
  const midY = roundHalf((start.y + end.y) / 2);
  const xRails = uniqueNumbers([
    midX,
    start.x,
    end.x,
    bounds.left - OUTER_RAIL_PADDING,
    bounds.right + OUTER_RAIL_PADDING,
    ...obstacles.flatMap((obstacle) => [obstacle.left, obstacle.right]),
  ]);
  const yRails = uniqueNumbers([
    midY,
    start.y,
    end.y,
    bounds.top - OUTER_RAIL_PADDING,
    bounds.bottom + OUTER_RAIL_PADDING,
    ...obstacles.flatMap((obstacle) => [obstacle.top, obstacle.bottom]),
  ]);

  const candidates: Point[][] = [
    [start, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    ...xRails.map((x) => [start, { x, y: start.y }, { x, y: end.y }, end]),
    ...yRails.map((y) => [start, { x: start.x, y }, { x: end.x, y }, end]),
  ];

  const clearRoutes = candidates
    .map(simplifyPoints)
    .filter((path) => isClearPath(path, obstacles))
    .sort((a, b) => routeScore(a, start, end) - routeScore(b, start, end));

  return clearRoutes[0] ?? fallbackOuterRoute(start, end, bounds);
}

function uniqueSidePairs(pairs: Array<[Direction, Direction]>): Array<[Direction, Direction]> {
  const seen = new Set<string>();
  const next: Array<[Direction, Direction]> = [];

  for (const pair of pairs) {
    const key = pair.join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(pair);
  }

  return next;
}

function pathCrossesTables(points: Point[], tables: TableModel[]): boolean {
  const obstacles = tables.map((table) => tableToObstacle(table, 0));
  return points.some((point, index) => index < points.length - 1 && !isClearSegment(point, points[index + 1], obstacles));
}

function fallbackOuterRoute(start: Point, end: Point, bounds: Obstacle): Point[] {
  const top = bounds.top - OUTER_RAIL_PADDING;
  const bottom = bounds.bottom + OUTER_RAIL_PADDING;
  const topRoute = simplifyPoints([start, { x: start.x, y: top }, { x: end.x, y: top }, end]);
  const bottomRoute = simplifyPoints([start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end]);
  return routeScore(topRoute, start, end) <= routeScore(bottomRoute, start, end) ? topRoute : bottomRoute;
}

function isClearPath(path: Point[], obstacles: Obstacle[]): boolean {
  return path.every((point) => !isInsideObstacle(point, obstacles)) &&
    path.every((point, index) => index === path.length - 1 || isClearSegment(point, path[index + 1], obstacles));
}

function isClearSegment(a: Point, b: Point, obstacles: Obstacle[]): boolean {
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return !obstacles.some((obstacle) =>
      a.x > obstacle.left &&
      a.x < obstacle.right &&
      minY < obstacle.bottom &&
      maxY > obstacle.top,
    );
  }

  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return !obstacles.some((obstacle) =>
      a.y > obstacle.top &&
      a.y < obstacle.bottom &&
      minX < obstacle.right &&
      maxX > obstacle.left,
    );
  }

  return false;
}

function routeScore(path: Point[], start: Point, end: Point): number {
  const distance = path.reduce((total, point, index) =>
    index === 0 ? 0 : total + manhattan(path[index - 1], point), 0);
  const bends = Math.max(0, path.length - 2);
  const drift = path.reduce((total, point) => total + distanceFromBox(point, start, end), 0);
  return distance + bends * BEND_PENALTY + drift * 0.08;
}

function distanceFromBox(point: Point, a: Point, b: Point): number {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const dx = point.x < minX ? minX - point.x : point.x > maxX ? point.x - maxX : 0;
  const dy = point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0;
  return dx + dy;
}

function offsetFromSide(point: Point, side: Direction, distance: number): Point {
  if (side === "north") return { x: point.x, y: point.y - distance };
  if (side === "south") return { x: point.x, y: point.y + distance };
  if (side === "west") return { x: point.x - distance, y: point.y };
  return { x: point.x + distance, y: point.y };
}

function tableToObstacle(table: TableModel, padding: number): Obstacle {
  return {
    left: table.x - padding,
    top: table.y - padding,
    right: table.x + table.width + padding,
    bottom: table.y + table.height + padding,
  };
}

function routeBounds(start: Point, end: Point, obstacles: Obstacle[]): Obstacle {
  return {
    left: Math.min(start.x, end.x, ...obstacles.map((item) => item.left)),
    top: Math.min(start.y, end.y, ...obstacles.map((item) => item.top)),
    right: Math.max(start.x, end.x, ...obstacles.map((item) => item.right)),
    bottom: Math.max(start.y, end.y, ...obstacles.map((item) => item.bottom)),
  };
}

function isInsideObstacle(point: Point, obstacles: Obstacle[]): boolean {
  return obstacles.some((obstacle) =>
    point.x > obstacle.left &&
    point.x < obstacle.right &&
    point.y > obstacle.top &&
    point.y < obstacle.bottom,
  );
}

function simplifyPoints(points: Point[]): Point[] {
  const withoutDuplicates = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  const simplified: Point[] = [];

  for (const point of withoutDuplicates) {
    const before = simplified[simplified.length - 2];
    const current = simplified[simplified.length - 1];

    if (before && current && isCollinear(before, current, point)) {
      simplified[simplified.length - 1] = point;
    } else {
      simplified.push(point);
    }
  }

  return simplified;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.map(roundHalf))).sort((a, b) => Math.abs(a) - Math.abs(b));
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
