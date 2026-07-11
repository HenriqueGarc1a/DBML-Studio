import type { Point, RelationModel, TableModel } from "../model/types";
import {
  bendRelationSegment,
  getRelationGeometry,
  moveRelationCorner,
  moveRelationSegment,
} from "./geometry";
import {
  inspectRelationSafety,
  relationClearanceMargin,
  routePointsAroundTables,
  type RelationSafetyInspection,
} from "./relationRouting";

export type RelationSegmentEditMode = "move" | "bend";

export interface SafeSegmentEditRequest {
  relation: RelationModel;
  tables: TableModel[];
  sourcePoints: Point[];
  segmentIndex: number;
  anchor: Point;
  desiredDelta: number;
  margin: number;
  mode: RelationSegmentEditMode;
  previousDelta?: number;
}

export interface SafeSegmentEditResult {
  viaPoints: Point[];
  desiredDelta: number;
  resolvedDelta: number;
  constrained: boolean;
  selfIntersection: boolean;
  blockingTableIds: string[];
}

export interface SafeCornerEditRequest {
  relation: RelationModel;
  tables: TableModel[];
  sourcePoints: Point[];
  pointIndex: number;
  desired: Point;
  margin: number;
  previousPosition?: Point;
}

export interface SafeCornerEditResult {
  viaPoints: Point[];
  desired: Point;
  resolved: Point;
  constrained: boolean;
  selfIntersection: boolean;
  blockingTableIds: string[];
}

/**
 * Resolves a segment drag to the closest safe position. The search is done at
 * one-diagram-unit precision so an obstacle feels like a solid boundary rather
 * than causing the relation to jump to a distant route.
 */
export function resolveSafeSegmentEdit(request: SafeSegmentEditRequest): SafeSegmentEditResult {
  const desired = evaluateSegmentCandidate(request, request.desiredDelta);
  if (desired.inspection.valid) {
    return resultFromCandidate(desired, request.desiredDelta, request.desiredDelta, false);
  }

  // Most pointer moves arrive next to the last safe frame. Projecting from
  // that position to the cursor is both smoother and much cheaper than a
  // fresh global scan, especially in diagrams with many tables.
  if (request.previousDelta !== undefined && Math.abs(request.previousDelta - request.desiredDelta) > 0.01) {
    const previous = evaluateSegmentCandidate(request, request.previousDelta);
    if (previous.inspection.valid) {
      const projected = projectFromPreviousSafeDelta(request, request.previousDelta, request.desiredDelta);
      return resultFromCandidate(
        projected.candidate,
        request.desiredDelta,
        projected.delta,
        true,
        desired.inspection,
      );
    }
  }

  const maxTableSpan = Math.max(0, ...request.tables.map((table) => Math.max(table.width, table.height)));
  const maxDistance = Math.ceil(Math.max(960, maxTableSpan + request.margin * 8));

  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const deltas = nearestDeltaOrder(
      request.desiredDelta - distance,
      request.desiredDelta + distance,
      request.previousDelta,
    );

    for (const delta of deltas) {
      const candidate = evaluateSegmentCandidate(request, delta);
      if (candidate.inspection.valid) {
        return resultFromCandidate(candidate, request.desiredDelta, delta, true, desired.inspection);
      }
    }
  }

  return {
    viaPoints: request.relation.viaPoints,
    desiredDelta: request.desiredDelta,
    resolvedDelta: 0,
    constrained: true,
    selfIntersection: desired.inspection.selfIntersection,
    blockingTableIds: desired.inspection.blockingTableIds,
  };
}

function projectFromPreviousSafeDelta(
  request: SafeSegmentEditRequest,
  safeDelta: number,
  invalidDelta: number,
): { candidate: EvaluatedCandidate; delta: number } {
  let safe = safeDelta;
  let unsafe = invalidDelta;
  let candidate = evaluateSegmentCandidate(request, safe);

  for (let iteration = 0; iteration < 14 && Math.abs(unsafe - safe) > 0.1; iteration += 1) {
    const middle = (safe + unsafe) / 2;
    const middleCandidate = evaluateSegmentCandidate(request, middle);
    if (middleCandidate.inspection.valid) {
      safe = middle;
      candidate = middleCandidate;
    } else {
      unsafe = middle;
    }
  }

  return { candidate, delta: safe };
}

/** Compatibility wrapper retained for callers outside the pointer editor. */
export function snapSegmentEdit(
  relation: RelationModel,
  tables: TableModel[],
  sourcePoints: Point[],
  segmentIndex: number,
  desiredDelta: number,
  margin: number,
  _step = 4,
): Point[] {
  const a = sourcePoints[segmentIndex];
  const b = sourcePoints[segmentIndex + 1];
  const anchor = a && b
    ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    : { x: 0, y: 0 };

  return resolveSafeSegmentEdit({
    relation,
    tables,
    sourcePoints,
    segmentIndex,
    anchor,
    desiredDelta,
    margin,
    mode: "move",
  }).viaPoints;
}

export function snapCornerEdit(
  relation: RelationModel,
  tables: TableModel[],
  sourcePoints: Point[],
  pointIndex: number,
  desired: Point,
  margin: number,
  _step = 4,
): Point[] {
  return resolveSafeCornerEdit({
    relation,
    tables,
    sourcePoints,
    pointIndex,
    desired,
    margin,
    previousPosition: sourcePoints[pointIndex],
  }).viaPoints;
}

export function resolveSafeCornerEdit(request: SafeCornerEditRequest): SafeCornerEditResult {
  const desired = evaluateCornerCandidate(request, request.desired);
  if (desired.inspection.valid) {
    return cornerResult(desired, request.desired, request.desired, false);
  }

  const original = request.sourcePoints[request.pointIndex];
  const previousPosition = request.previousPosition ?? original;
  if (previousPosition) {
    const previous = evaluateCornerCandidate(request, previousPosition);
    if (previous.inspection.valid) {
      const projected = projectFromPreviousSafeCorner(request, previousPosition, request.desired);
      return cornerResult(projected.candidate, request.desired, projected.position, true, desired.inspection);
    }
  }

  return {
    viaPoints: request.relation.viaPoints,
    desired: request.desired,
    resolved: original ?? request.desired,
    constrained: true,
    selfIntersection: desired.inspection.selfIntersection,
    blockingTableIds: desired.inspection.blockingTableIds,
  };
}

interface EvaluatedCandidate {
  viaPoints: Point[];
  inspection: RelationSafetyInspection;
}

function evaluateSegmentCandidate(request: SafeSegmentEditRequest, delta: number): EvaluatedCandidate {
  const rawViaPoints = request.mode === "bend"
    ? bendRelationSegment(
      request.sourcePoints,
      request.segmentIndex,
      request.anchor,
      delta,
      localBendHalfSize(request.sourcePoints, request.segmentIndex),
    )
    : moveRelationSegment(request.sourcePoints, request.segmentIndex, delta);
  const viaPoints = normalizeCandidate(request.relation, request.tables, rawViaPoints);
  const inspection = inspectRelationSafety(
    { ...request.relation, route: "orthogonal", viaPoints },
    request.tables,
    request.margin,
  );

  return { viaPoints, inspection };
}

function evaluateCornerCandidate(request: SafeCornerEditRequest, position: Point): EvaluatedCandidate {
  const directViaPoints = normalizeCandidate(
    request.relation,
    request.tables,
    moveRelationCorner(request.sourcePoints, request.pointIndex, position),
  );
  const directInspection = inspectRelationSafety(
    { ...request.relation, route: "orthogonal", viaPoints: directViaPoints },
    request.tables,
    request.margin,
  );
  if (directInspection.valid) return { viaPoints: directViaPoints, inspection: directInspection };

  const reroutedViaPoints = rerouteCornerCandidate(request, position);
  if (!reroutedViaPoints) return { viaPoints: directViaPoints, inspection: directInspection };
  const reroutedInspection = inspectRelationSafety(
    { ...request.relation, route: "orthogonal", viaPoints: reroutedViaPoints },
    request.tables,
    request.margin,
  );
  return reroutedInspection.valid
    ? { viaPoints: reroutedViaPoints, inspection: reroutedInspection }
    : { viaPoints: directViaPoints, inspection: directInspection };
}

function rerouteCornerCandidate(request: SafeCornerEditRequest, position: Point): Point[] | undefined {
  const start = request.sourcePoints[0];
  const end = request.sourcePoints[request.sourcePoints.length - 1];
  if (!start || !end) return undefined;
  const clearance = relationClearanceMargin(request.relation, request.margin);
  const fromSide = request.relation.fromSide === "west" ? "west" : "east";
  const toSide = request.relation.toSide === "west" ? "west" : "east";
  const startExit = { x: start.x + (fromSide === "east" ? clearance : -clearance), y: start.y };
  const endExit = { x: end.x + (toSide === "east" ? clearance : -clearance), y: end.y };
  const moved = request.sourcePoints.map((point, index) => index === request.pointIndex ? position : point);
  const internal = moved.slice(1, -1).filter((point, index) => {
    const sourceIndex = index + 1;
    return sourceIndex === request.pointIndex || !pointInsideAnyTableMargin(point, request.tables, clearance);
  });
  const routed = routePointsAroundTables([startExit, ...internal, endExit], request.tables, clearance);
  if (!routed) return undefined;
  return normalizeCandidate(request.relation, request.tables, [startExit, ...routed.slice(1, -1), endExit]);
}

function pointInsideAnyTableMargin(point: Point, tables: TableModel[], padding: number): boolean {
  return tables.some((table) =>
    point.x > table.x - padding &&
    point.x < table.x + table.width + padding &&
    point.y > table.y - padding &&
    point.y < table.y + table.height + padding,
  );
}

function projectFromPreviousSafeCorner(
  request: SafeCornerEditRequest,
  safePosition: Point,
  invalidPosition: Point,
): { candidate: EvaluatedCandidate; position: Point } {
  let safe = safePosition;
  let unsafe = invalidPosition;
  let candidate = evaluateCornerCandidate(request, safe);

  for (let iteration = 0; iteration < 15 && distanceSquared(safe, unsafe) > 0.01; iteration += 1) {
    const middle = { x: (safe.x + unsafe.x) / 2, y: (safe.y + unsafe.y) / 2 };
    const middleCandidate = evaluateCornerCandidate(request, middle);
    if (middleCandidate.inspection.valid) {
      safe = middle;
      candidate = middleCandidate;
    } else {
      unsafe = middle;
    }
  }

  return { candidate, position: safe };
}

function normalizeCandidate(relation: RelationModel, tables: TableModel[], viaPoints: Point[]): Point[] {
  const fromTable = tables.find((table) => table.id === relation.fromTable);
  const toTable = tables.find((table) => table.id === relation.toTable);
  if (!fromTable || !toTable) return viaPoints;

  return getRelationGeometry({ ...relation, route: "orthogonal", viaPoints }, fromTable, toTable)
    .points
    .slice(1, -1);
}

function resultFromCandidate(
  candidate: EvaluatedCandidate,
  desiredDelta: number,
  resolvedDelta: number,
  constrained: boolean,
  desiredInspection: RelationSafetyInspection = candidate.inspection,
): SafeSegmentEditResult {
  return {
    viaPoints: candidate.viaPoints,
    desiredDelta,
    resolvedDelta,
    constrained,
    selfIntersection: desiredInspection.selfIntersection,
    blockingTableIds: desiredInspection.blockingTableIds,
  };
}

function cornerResult(
  candidate: EvaluatedCandidate,
  desired: Point,
  resolved: Point,
  constrained: boolean,
  desiredInspection: RelationSafetyInspection = candidate.inspection,
): SafeCornerEditResult {
  return {
    viaPoints: candidate.viaPoints,
    desired,
    resolved,
    constrained,
    selfIntersection: desiredInspection.selfIntersection,
    blockingTableIds: desiredInspection.blockingTableIds,
  };
}

function nearestDeltaOrder(a: number, b: number, previousDelta?: number): number[] {
  if (previousDelta === undefined) return [a, b];
  return Math.abs(a - previousDelta) <= Math.abs(b - previousDelta) ? [a, b] : [b, a];
}

function localBendHalfSize(points: Point[], segmentIndex: number): number {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  if (!a || !b) return 24;
  return Math.max(16, Math.min(32, Math.hypot(b.x - a.x, b.y - a.y) * 0.16));
}

function distanceSquared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
