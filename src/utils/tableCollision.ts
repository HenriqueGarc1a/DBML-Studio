import type { Point, TableModel } from "../model/types";

export const TABLE_GAP = 16;

export function nearestNonOverlappingPosition(
  table: TableModel,
  tables: TableModel[],
  gap = TABLE_GAP,
): Point {
  const others = tables.filter((item) => item.id !== table.id);
  const origin = { x: table.x, y: table.y };
  if (isClear(table, origin, others, gap)) return origin;

  const xs = new Set<number>([origin.x]);
  const ys = new Set<number>([origin.y]);
  for (const other of others) {
    xs.add(other.x - table.width - gap);
    xs.add(other.x + other.width + gap);
    ys.add(other.y - table.height - gap);
    ys.add(other.y + other.height + gap);
  }

  const candidates = Array.from(xs).flatMap((x) =>
    Array.from(ys).map((y) => ({ x, y })),
  ).sort((a, b) => distanceSquared(a, origin) - distanceSquared(b, origin));

  return candidates.find((position) => isClear(table, position, others, gap)) ?? origin;
}

export function tablesOverlap(a: TableModel, b: TableModel, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function isClear(table: TableModel, position: Point, others: TableModel[], gap: number): boolean {
  const placed = { ...table, ...position };
  return others.every((other) => !tablesOverlap(placed, other, gap));
}

function distanceSquared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
