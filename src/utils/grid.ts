import type { Point } from "../model/types";

export const GRID_SIZE = 4;

export function snapValue(value: number, gridSize = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, enabled: boolean, gridSize = GRID_SIZE): Point {
  if (!enabled) return point;

  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}
