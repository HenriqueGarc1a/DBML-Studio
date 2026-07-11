import type { Direction, Point, RelationModel, TableModel } from "../model/types";
import { getColumnPoint, normalizeRelationSide } from "./geometry";
import { relationClearanceMargin } from "./relationRouting";

export interface RelationSnapAxis {
  tableId: string;
  anchor: Point;
}

export interface RelationPointAlignment {
  point: Point;
  horizontal?: RelationSnapAxis;
  vertical?: RelationSnapAxis;
}

interface TableExit {
  tableId: string;
  anchor: Point;
}

/**
 * Gives table exits magnetic priority over the ordinary grid. `point` is the
 * raw pointer position used to decide whether the magnet engages, while
 * `fallback` is normally the grid-snapped position kept on axes with no match.
 */
export function snapRelationPointToTableExits(
  relation: RelationModel,
  tables: TableModel[],
  point: Point,
  fallback: Point,
  margin: number,
  threshold = 10,
): RelationPointAlignment {
  const exits = relationTableExits(relation, tables, margin);
  const horizontal = nearestExit(exits, (exit) => Math.abs(point.y - exit.anchor.y), threshold);
  const vertical = nearestExit(exits, (exit) => Math.abs(point.x - exit.anchor.x), threshold);

  return {
    point: {
      x: vertical?.anchor.x ?? fallback.x,
      y: horizontal?.anchor.y ?? fallback.y,
    },
    horizontal,
    vertical,
  };
}

export function relationSnapThreshold(gridSize: number): number {
  return Math.max(8, Math.min(16, gridSize * 0.6));
}

function relationTableExits(relation: RelationModel, tables: TableModel[], margin: number): TableExit[] {
  const fromTable = tables.find((table) => table.id === relation.fromTable);
  const toTable = tables.find((table) => table.id === relation.toTable);
  const clearance = relationClearanceMargin(relation, margin);
  const exits: TableExit[] = [];

  if (fromTable) {
    exits.push(exitForTable(
      fromTable,
      relation.fromColumn,
      normalizeRelationSide(relation.fromSide),
      clearance,
    ));
  }
  if (toTable) {
    exits.push(exitForTable(
      toTable,
      relation.toColumn,
      normalizeRelationSide(relation.toSide),
      clearance,
    ));
  }

  return exits;
}

function exitForTable(
  table: TableModel,
  column: string,
  side: Direction,
  clearance: number,
): TableExit {
  const endpoint = getColumnPoint(table, column, side);
  return {
    tableId: table.id,
    anchor: {
      x: endpoint.x + (side === "east" ? clearance : -clearance),
      y: endpoint.y,
    },
  };
}

function nearestExit(
  exits: TableExit[],
  distance: (exit: TableExit) => number,
  threshold: number,
): TableExit | undefined {
  return exits
    .map((exit) => ({ exit, distance: distance(exit) }))
    .filter((candidate) => candidate.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)[0]?.exit;
}
