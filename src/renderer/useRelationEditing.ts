import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point, RelationModel, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { insertRelationMidpoint, relationSideAtPointer } from "../utils/relationInteraction";
import {
  relationSnapThreshold,
  snapRelationPointToTableExits,
  type RelationPointAlignment,
} from "../utils/relationPointSnap";
import { resolveSafeCornerEdit, type SafeCornerEditResult } from "../utils/safeRelationEditing";
import { organizeRelationRouteOnFixedSides } from "../utils/relationRouting";
import type { DiagramCanvasController } from "./types";

const DRAG_THRESHOLD_PX = 5;

interface PointEditSession {
  phase: "armed" | "dragging";
  pointerId: number;
  relation: RelationModel;
  basePoints: Point[];
  pointIndex: number;
  original: Point;
  start: Point;
  clientStart: Point;
  previewViaPoints: Point[];
  requested: Point;
  applied: Point;
  constrained: boolean;
  selfIntersection: boolean;
  blockingTableIds: string[];
  alignment?: RelationPointAlignment;
}

interface EndpointEditSession {
  phase: "armed" | "dragging";
  pointerId: number;
  relation: RelationModel;
  endpoint: "from" | "to";
  fromTable: TableModel;
  toTable: TableModel;
  clientStart: Point;
  previewRelation: RelationModel;
}

export interface RelationEditFeedback {
  requested: Point;
  applied: Point;
  message: string;
  blockingTableIds: string[];
}

interface UseRelationEditingOptions {
  controller: DiagramCanvasController;
  svgRef: MutableRefObject<SVGSVGElement | null>;
  toSvgPoint(event: Pick<ReactPointerEvent, "clientX" | "clientY">): Point;
}

export function useRelationEditing({ controller, svgRef, toSvgPoint }: UseRelationEditingOptions) {
  const [session, setSession] = useState<PointEditSession>();
  const sessionRef = useRef<PointEditSession>();
  const [endpointSession, setEndpointSession] = useState<EndpointEditSession>();
  const endpointSessionRef = useRef<EndpointEditSession>();

  const storeSession = useCallback((next: PointEditSession | undefined) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const storeEndpointSession = useCallback((next: EndpointEditSession | undefined) => {
    endpointSessionRef.current = next;
    setEndpointSession(next);
  }, []);

  const selectRelation = useCallback((event: ReactPointerEvent<SVGElement>, relation: RelationModel) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    controller.setSelected({ type: "relation", id: relation.id });
  }, [controller]);

  const armPoint = useCallback((
    event: ReactPointerEvent<SVGElement>,
    relation: RelationModel,
    basePoints: Point[],
    pointIndex: number,
  ) => {
    if (!event.isPrimary || event.button !== 0) return;
    const original = basePoints[pointIndex];
    if (!original || pointIndex <= 0 || pointIndex >= basePoints.length - 1) return;
    event.stopPropagation();
    event.preventDefault();
    controller.setSelected({ type: "relation", id: relation.id });
    const start = toSvgPoint(event);
    svgRef.current?.setPointerCapture(event.pointerId);
    storeSession({
      phase: "armed",
      pointerId: event.pointerId,
      relation: { ...relation, viaPoints: relation.viaPoints.map((point) => ({ ...point })) },
      basePoints,
      pointIndex,
      original,
      start,
      clientStart: { x: event.clientX, y: event.clientY },
      previewViaPoints: relation.viaPoints,
      requested: original,
      applied: original,
      constrained: false,
      selfIntersection: false,
      blockingTableIds: [],
      alignment: undefined,
    });
  }, [controller, storeSession, svgRef, toSvgPoint]);

  const armCorner = useCallback((
    event: ReactPointerEvent<SVGElement>,
    relation: RelationModel,
    fromTable: TableModel,
    toTable: TableModel,
    pointIndex: number,
  ) => {
    armPoint(event, relation, getRelationGeometry(relation, fromTable, toTable).points, pointIndex);
  }, [armPoint]);

  const armMidpoint = useCallback((
    event: ReactPointerEvent<SVGElement>,
    relation: RelationModel,
    fromTable: TableModel,
    toTable: TableModel,
    segmentIndex: number,
  ) => {
    const points = getRelationGeometry(relation, fromTable, toTable).points;
    const insertion = insertRelationMidpoint(points, segmentIndex);
    if (!insertion) return;
    armPoint(event, relation, insertion.points, insertion.pointIndex);
  }, [armPoint]);

  const armEndpoint = useCallback((
    event: ReactPointerEvent<SVGElement>,
    relation: RelationModel,
    fromTable: TableModel,
    toTable: TableModel,
    endpoint: "from" | "to",
  ) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    controller.setSelected({ type: "relation", id: relation.id });
    svgRef.current?.setPointerCapture(event.pointerId);
    storeEndpointSession({
      phase: "armed",
      pointerId: event.pointerId,
      relation: { ...relation, viaPoints: relation.viaPoints.map((point) => ({ ...point })) },
      endpoint,
      fromTable,
      toTable,
      clientStart: { x: event.clientX, y: event.clientY },
      previewRelation: relation,
    });
  }, [controller, storeEndpointSession, svgRef]);

  const resolvePoint = useCallback((current: PointEditSession, desired: Point) =>
    resolveSafeCornerEdit({
      relation: current.relation,
      tables: controller.diagram.tables,
      sourcePoints: current.basePoints,
      pointIndex: current.pointIndex,
      desired,
      margin: controller.diagram.visual.tableRouteMargin,
      previousPosition: current.applied,
    }), [controller.diagram.tables, controller.diagram.visual.tableRouteMargin]);

  const alignToTableExit = useCallback((current: PointEditSession, raw: Point, fallback: Point) =>
    snapRelationPointToTableExits(
      current.relation,
      controller.diagram.tables,
      raw,
      fallback,
      controller.diagram.visual.tableRouteMargin,
      relationSnapThreshold(controller.diagram.visual.gridSize),
    ), [
      controller.diagram.tables,
      controller.diagram.visual.gridSize,
      controller.diagram.visual.tableRouteMargin,
    ]);

  const move = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const endpointCurrent = endpointSessionRef.current;
    if (endpointCurrent && event.pointerId === endpointCurrent.pointerId) {
      event.preventDefault();
      const clientDistance = Math.hypot(
        event.clientX - endpointCurrent.clientStart.x,
        event.clientY - endpointCurrent.clientStart.y,
      );
      if (endpointCurrent.phase === "armed" && clientDistance < DRAG_THRESHOLD_PX) return true;
      if (endpointCurrent.phase === "armed") controller.beginHistoryBatch();
      const pointer = toSvgPoint(event);
      const previewRelation = previewEndpointSide(endpointCurrent, pointer, controller.diagram.tables, controller.diagram.visual.tableRouteMargin);
      storeEndpointSession({ ...endpointCurrent, phase: "dragging", previewRelation });
      return true;
    }

    const current = sessionRef.current;
    if (!current || event.pointerId !== current.pointerId) return false;
    event.preventDefault();
    const pointer = toSvgPoint(event);
    const clientDistance = Math.hypot(event.clientX - current.clientStart.x, event.clientY - current.clientStart.y);
    if (current.phase === "armed" && clientDistance < DRAG_THRESHOLD_PX) return true;
    if (current.phase === "armed") controller.beginHistoryBatch();
    const desired = translatedPoint(current, pointer);
    const alignment = alignToTableExit(current, desired, desired);
    storeSession(sessionResult(current, resolvePoint(current, alignment.point), alignment));
    return true;
  }, [alignToTableExit, controller, resolvePoint, storeEndpointSession, storeSession, toSvgPoint]);

  const finish = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const endpointCurrent = endpointSessionRef.current;
    if (endpointCurrent && event.pointerId === endpointCurrent.pointerId) {
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (endpointCurrent.phase === "dragging") {
        const patch = endpointCurrent.endpoint === "from"
          ? { fromSide: endpointCurrent.previewRelation.fromSide, sideMode: "manual" as const }
          : { toSide: endpointCurrent.previewRelation.toSide, sideMode: "manual" as const };
        controller.updateRelation(endpointCurrent.relation.id, patch);
        controller.endHistoryBatch();
      }
      storeEndpointSession(undefined);
      return true;
    }

    const current = sessionRef.current;
    if (!current || event.pointerId !== current.pointerId) return false;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (current.phase === "dragging") {
      const raw = translatedPoint(current, toSvgPoint(event));
      const gridPoint = snapPoint(
        raw,
        controller.snapToGrid ? controller.diagram.visual.gridSize : undefined,
      );
      const alignment = alignToTableExit(current, raw, gridPoint);
      const result = resolvePoint(current, alignment.point);
      const currentRelation = controller.diagram.relations.find((relation) => relation.id === current.relation.id);
      if (currentRelation && !samePoints(currentRelation.viaPoints, result.viaPoints)) {
        controller.updateRelation(current.relation.id, { route: "orthogonal", viaPoints: result.viaPoints });
      }
      controller.endHistoryBatch();
    }

    storeSession(undefined);
    return true;
  }, [alignToTableExit, controller, resolvePoint, storeEndpointSession, storeSession, toSvgPoint]);

  const cancel = useCallback((event?: ReactPointerEvent<SVGSVGElement>): boolean => {
    const endpointCurrent = endpointSessionRef.current;
    if (endpointCurrent && (!event || event.pointerId === endpointCurrent.pointerId)) {
      if (event?.currentTarget.hasPointerCapture(endpointCurrent.pointerId)) {
        event.currentTarget.releasePointerCapture(endpointCurrent.pointerId);
      } else if (svgRef.current?.hasPointerCapture(endpointCurrent.pointerId)) {
        svgRef.current.releasePointerCapture(endpointCurrent.pointerId);
      }
      if (endpointCurrent.phase === "dragging") controller.endHistoryBatch();
      storeEndpointSession(undefined);
      return true;
    }

    const current = sessionRef.current;
    if (!current || (event && event.pointerId !== current.pointerId)) return false;
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } else if (svgRef.current?.hasPointerCapture(current.pointerId)) {
      svgRef.current.releasePointerCapture(current.pointerId);
    }
    if (current.phase === "dragging") controller.endHistoryBatch();
    storeSession(undefined);
    return true;
  }, [controller, storeEndpointSession, storeSession, svgRef]);

  useEffect(() => {
    if (!session && !endpointSession) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, endpointSession, session]);

  const displayRelation = useCallback((relation: RelationModel): RelationModel => {
    if (endpointSession?.phase === "dragging" && endpointSession.relation.id === relation.id) {
      return endpointSession.previewRelation;
    }
    if (session?.phase !== "dragging" || session.relation.id !== relation.id) return relation;
    return { ...relation, route: "orthogonal", viaPoints: session.previewViaPoints };
  }, [endpointSession, session]);

  const feedback = useMemo<RelationEditFeedback | undefined>(() => {
    if (session?.phase !== "dragging" || !session.constrained) return undefined;
    return {
      requested: session.requested,
      applied: session.applied,
      message: session.blockingTableIds.length
        ? "Margem protegida — ponto encaixado na posição segura mais próxima"
        : "Autocruzamento evitado — ponto encaixado na posição segura mais próxima",
      blockingTableIds: session.blockingTableIds,
    };
  }, [session]);

  return {
    active: Boolean(session || endpointSession),
    dragging: session?.phase === "dragging" || endpointSession?.phase === "dragging",
    relationId: session?.relation.id ?? endpointSession?.relation.id,
    pointIndex: session?.pointIndex,
    constrained: Boolean(session?.phase === "dragging" && session.constrained),
    feedback,
    alignment: session?.phase === "dragging" ? session.alignment : undefined,
    obstacleTableIds: new Set(feedback?.blockingTableIds ?? []),
    selectRelation,
    armMidpoint,
    armCorner,
    armEndpoint,
    move,
    finish,
    cancel,
    displayRelation,
  };
}

function sessionResult(
  session: PointEditSession,
  result: SafeCornerEditResult,
  alignment: RelationPointAlignment,
): PointEditSession {
  return {
    ...session,
    phase: "dragging",
    previewViaPoints: result.viaPoints,
    requested: result.desired,
    applied: result.resolved,
    constrained: result.constrained,
    selfIntersection: result.selfIntersection,
    blockingTableIds: result.blockingTableIds,
    alignment: appliedAlignment(alignment, result.resolved),
  };
}

function previewEndpointSide(
  session: EndpointEditSession,
  pointer: Point,
  tables: TableModel[],
  margin: number,
): RelationModel {
  const table = session.endpoint === "from" ? session.fromTable : session.toTable;
  const currentSide = session.endpoint === "from"
    ? session.previewRelation.fromSide
    : session.previewRelation.toSide;
  const side = relationSideAtPointer(table, pointer, currentSide);
  const candidate: RelationModel = {
    ...session.relation,
    fromSide: session.endpoint === "from" ? side : session.relation.fromSide,
    toSide: session.endpoint === "to" ? side : session.relation.toSide,
    sideMode: "manual",
  };
  const route = organizeRelationRouteOnFixedSides(
    candidate,
    session.fromTable,
    session.toTable,
    tables,
    candidate.fromSide,
    candidate.toSide,
    margin,
  );
  return { ...candidate, ...route, route: "orthogonal" };
}

function appliedAlignment(alignment: RelationPointAlignment, resolved: Point): RelationPointAlignment | undefined {
  const horizontal = alignment.horizontal && Math.abs(resolved.y - alignment.point.y) < 0.1
    ? alignment.horizontal
    : undefined;
  const vertical = alignment.vertical && Math.abs(resolved.x - alignment.point.x) < 0.1
    ? alignment.vertical
    : undefined;
  return horizontal || vertical ? { point: resolved, horizontal, vertical } : undefined;
}

function translatedPoint(session: PointEditSession, pointer: Point): Point {
  return {
    x: session.original.x + pointer.x - session.start.x,
    y: session.original.y + pointer.y - session.start.y,
  };
}

function snapPoint(point: Point, gridSize?: number): Point {
  if (!gridSize) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

function samePoints(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((point, index) =>
    Math.abs(point.x - b[index].x) < 0.01 && Math.abs(point.y - b[index].y) < 0.01,
  );
}
