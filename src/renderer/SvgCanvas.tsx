import type { MouseEvent, MutableRefObject, PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderPlus,
  GripVertical,
  LayoutTemplate,
  Magnet,
  Maximize2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DiagramController } from "../editor/useDiagramController";
import {
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  getTableMinHeight,
  TABLE_MIN_WIDTH,
} from "../model/defaults";
import type { GroupModel, Point, RelationModel, TableModel } from "../model/types";
import {
  getRelationGeometry,
  getTableBounds,
  snapRelationEndpoint,
} from "../utils/geometry";
import { snapPoint, snapValue } from "../utils/grid";
import { buildJumpPath } from "../utils/lineJumps";
import { distributeRelationEndpoints } from "../utils/relationLayout";
import {
  fitViewBoxToAspect,
  getZoom,
  panViewBox,
  unionViewBox,
  zoomViewBox,
  type ViewBox,
} from "../utils/viewport";
import { GroupNode } from "./GroupNode";
import { RelationPath } from "./RelationPath";
import type { ResizeCorner } from "./ResizeHandles";
import { TableNode } from "./TableNode";

interface ResizeOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragState =
  | {
      kind: "table";
      id: string;
      start: Point;
      origin: Point;
    }
  | {
      kind: "table-resize";
      id: string;
      corner: ResizeCorner;
      start: Point;
      origin: ResizeOrigin;
    }
  | {
      kind: "group";
      id: string;
      start: Point;
      origin: Point;
    }
  | {
      kind: "group-resize";
      id: string;
      corner: ResizeCorner;
      start: Point;
      origin: ResizeOrigin;
    }
  | {
      kind: "via";
      id: string;
      index: number;
    }
  | {
      kind: "endpoint";
      id: string;
      endpoint: "start" | "end";
    }
  | {
      kind: "pan";
      pointerStart: Point;
      viewport: ViewBox;
    };

interface SvgCanvasProps {
  controller: DiagramController;
  svgRef?: MutableRefObject<SVGSVGElement | null>;
}

export function SvgCanvas({ controller, svgRef: externalSvgRef }: SvgCanvasProps) {
  const internalSvgRef = useRef<SVGSVGElement | null>(null);
  const svgRef = externalSvgRef ?? internalSvgRef;
  const [drag, setDrag] = useState<DragState | undefined>();
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [zoomPanelPosition, setZoomPanelPosition] = useState<Point>({ x: 12, y: 12 });
  const [zoomPanelDrag, setZoomPanelDrag] = useState<{ pointerStart: Point; origin: Point } | undefined>();
  const computedBounds = useMemo(
    () => getTableBounds(controller.diagram.tables),
    [controller.diagram.tables],
  );
  const [viewport, setViewport] = useState<ViewBox>(computedBounds);
  const [lastTableSignature, setLastTableSignature] = useState("");
  const tableMap = useMemo(
    () => new Map(controller.diagram.tables.map((table) => [table.id, table])),
    [controller.diagram.tables],
  );
  const tableSignature = useMemo(
    () => controller.diagram.tables.map((table) => table.id).join("|"),
    [controller.diagram.tables],
  );
  const displayRelations = useMemo(
    () => distributeRelationEndpoints(controller.diagram.relations, tableMap),
    [controller.diagram.relations, tableMap],
  );
  const zoom = getZoom(computedBounds, viewport);
  const selected = controller.selected;
  const gridSize = controller.diagram.visual.gridSize;
  const paintBounds = useMemo(
    () => expandPaintBounds(unionViewBox(computedBounds, viewport), gridSize),
    [computedBounds, gridSize, viewport],
  );
  const relationPaths = useMemo(() => {
    const paths = new Map<string, string>();
    const previousPolylines: Point[][] = [];

    for (const sourceRelation of controller.diagram.relations) {
      const relation = displayRelations.get(sourceRelation.id) ?? sourceRelation;
      const fromTable = tableMap.get(relation.fromTable);
      const toTable = tableMap.get(relation.toTable);
      if (!fromTable || !toTable) continue;

      const geometry = getRelationGeometry(relation, fromTable, toTable);
      const canJump = relation.route !== "curve" || relation.viaPoints.length > 0;

      paths.set(
        relation.id,
        canJump ? buildJumpPath(geometry.points, previousPolylines) : geometry.path,
      );

      if (canJump) {
        previousPolylines.push(geometry.points);
      }
    }

    return paths;
  }, [controller.diagram.relations, displayRelations, tableMap]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const updateCanvasSize = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      setCanvasSize((current) => {
        if (Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5) {
          return current;
        }

        return { width: rect.width, height: rect.height };
      });
    };

    updateCanvasSize();

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(svg);

    return () => observer.disconnect();
  }, [svgRef]);

  useEffect(() => {
    setZoomPanelPosition((current) =>
      clampOverlayPosition(current, svgRef.current?.parentElement, undefined, canvasSize),
    );
  }, [canvasSize, svgRef]);

  useEffect(() => {
    setViewport((current) => fitViewBoxToAspect(current, canvasSize.width, canvasSize.height));
  }, [canvasSize.height, canvasSize.width]);

  useEffect(() => {
    if (tableSignature !== lastTableSignature) {
      setViewport(fitViewBoxToAspect(computedBounds, canvasSize.width, canvasSize.height));
      setLastTableSignature(tableSignature);
    }
  }, [canvasSize.height, canvasSize.width, computedBounds, lastTableSignature, tableSignature]);

  const toSvgPoint = (event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    return matrix ? point.matrixTransform(matrix) : { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    event.preventDefault();

    if (drag.kind === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const dx = (event.clientX - drag.pointerStart.x) * (drag.viewport.width / svg.clientWidth);
      const dy = (event.clientY - drag.pointerStart.y) * (drag.viewport.height / svg.clientHeight);
      setViewport(panViewBox(drag.viewport, dx, dy));
      return;
    }

    const point = toSvgPoint(event);

    if (drag.kind === "table") {
      const nextX = drag.origin.x + point.x - drag.start.x;
      const nextY = drag.origin.y + point.y - drag.start.y;
      controller.updateTable(drag.id, {
        x: controller.snapToGrid ? snapValue(nextX, gridSize) : nextX,
        y: controller.snapToGrid ? snapValue(nextY, gridSize) : nextY,
        layoutSource: "manual",
      });
    }

    if (drag.kind === "table-resize") {
      const table = tableMap.get(drag.id);
      if (!table) return;
      const next = resizeBoxFromCorner(
        drag.origin,
        drag.corner,
        drag.start,
        point,
        TABLE_MIN_WIDTH,
        getTableMinHeight(table.columns.length),
        controller.snapToGrid,
        gridSize,
      );

      controller.updateTable(drag.id, { ...next, layoutSource: "manual" });
    }

    if (drag.kind === "group") {
      const nextX = drag.origin.x + point.x - drag.start.x;
      const nextY = drag.origin.y + point.y - drag.start.y;
      controller.updateGroup(drag.id, {
        x: controller.snapToGrid ? snapValue(nextX, gridSize) : nextX,
        y: controller.snapToGrid ? snapValue(nextY, gridSize) : nextY,
      });
    }

    if (drag.kind === "group-resize") {
      const next = resizeBoxFromCorner(
        drag.origin,
        drag.corner,
        drag.start,
        point,
        GROUP_MIN_WIDTH,
        GROUP_MIN_HEIGHT,
        controller.snapToGrid,
        gridSize,
      );

      controller.updateGroup(drag.id, next);
    }

    if (drag.kind === "via") {
      controller.updateViaPoint(drag.id, drag.index, snapPoint(point, controller.snapToGrid, gridSize));
    }

    if (drag.kind === "endpoint") {
      const relation = controller.diagram.relations.find((item) => item.id === drag.id);
      if (!relation) return;
      const table = tableMap.get(drag.endpoint === "start" ? relation.fromTable : relation.toTable);
      if (!table) return;
      const endpoint = snapRelationEndpoint(
        table,
        drag.endpoint === "start" ? relation.fromColumn : relation.toColumn,
        point,
        controller.snapToGrid,
        gridSize,
      );
      controller.updateRelation(relation.id, drag.endpoint === "start"
        ? {
            fromSide: endpoint.side,
            startOffsetX: endpoint.offsetX,
            startOffsetY: endpoint.offsetY,
          }
        : {
            toSide: endpoint.side,
            endOffsetX: endpoint.offsetX,
            endOffsetY: endpoint.offsetY,
          });
    }
  };

  const stopDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.kind !== "pan") {
      controller.endHistoryBatch();
    }
    setDrag(undefined);
  };

  const beginSvgDrag = (event: PointerEvent<SVGElement>, state: DragState) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    controller.beginHistoryBatch();
    setDrag(state);
  };

  const beginPan = (event: PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    controller.setSelected(undefined);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: "pan",
      pointerStart: { x: event.clientX, y: event.clientY },
      viewport,
    });
  };

  const zoomAt = (factor: number, center?: Point) => {
    setViewport((current) =>
      zoomViewBox(
        computedBounds,
        fitViewBoxToAspect(current, canvasSize.width, canvasSize.height),
        factor,
        center,
      ),
    );
  };

  const fitDiagram = () => {
    setViewport(fitViewBoxToAspect(computedBounds, canvasSize.width, canvasSize.height));
  };

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const deltaScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? canvasSize.height
        : 1;

    if (!event.shiftKey) {
      const deltaY = event.deltaY * deltaScale;
      zoomAt(Math.exp(-deltaY * 0.0015), toSvgPoint(event));
      return;
    }

    const svg = svgRef.current;
    const deltaX = (event.deltaX || event.deltaY) * deltaScale;
    const width = svg?.clientWidth || canvasSize.width || 1;

    setViewport((current) => ({
      ...current,
      x: current.x + deltaX * (current.width / width),
    }));
  };

  const addViaPoint = (relation: RelationModel, event: MouseEvent<SVGPathElement>) => {
    event.stopPropagation();
    controller.addViaPoint(relation.id, snapPoint(toSvgPoint(event), controller.snapToGrid, gridSize));
    controller.setSelected({ type: "relation", id: relation.id });
  };

  const beginZoomPanelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setZoomPanelDrag({
      pointerStart: { x: event.clientX, y: event.clientY },
      origin: zoomPanelPosition,
    });
  };

  const moveZoomPanel = (event: PointerEvent<HTMLButtonElement>) => {
    if (!zoomPanelDrag) return;
    event.preventDefault();
    event.stopPropagation();

    const panel = event.currentTarget.closest(".zoom-controls");
    const nextPosition = {
      x: zoomPanelDrag.origin.x + event.clientX - zoomPanelDrag.pointerStart.x,
      y: zoomPanelDrag.origin.y + event.clientY - zoomPanelDrag.pointerStart.y,
    };

    setZoomPanelPosition(clampOverlayPosition(nextPosition, svgRef.current?.parentElement, panel, canvasSize));
  };

  const stopZoomPanelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!zoomPanelDrag) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setZoomPanelDrag(undefined);
  };

  return (
    <>
      <svg
        ref={svgRef}
        className={`diagram-canvas${drag?.kind === "pan" ? " is-panning" : ""}`}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        data-export-viewbox={`${computedBounds.x} ${computedBounds.y} ${computedBounds.width} ${computedBounds.height}`}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onPointerDown={beginPan}
        onWheel={onWheel}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke={controller.diagram.visual.gridColor}
              strokeWidth="0.55"
            />
          </pattern>
        </defs>
        <rect
          x={paintBounds.x}
          y={paintBounds.y}
          width={paintBounds.width}
          height={paintBounds.height}
          fill={controller.diagram.visual.backgroundColor}
        />
        <rect
          x={paintBounds.x}
          y={paintBounds.y}
          width={paintBounds.width}
          height={paintBounds.height}
          fill="url(#grid)"
        />
        {controller.diagram.groups.map((group) => (
          <GroupNode
            key={group.id}
            group={group}
            selected={selected?.type === "group" && selected.id === group.id}
            onPointerDown={(event, item) => {
              controller.setSelected({ type: "group", id: item.id });
              beginSvgDrag(event, {
                kind: "group",
                id: item.id,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y },
              });
            }}
            onResizePointerDown={(event, item, corner) => {
              controller.setSelected({ type: "group", id: item.id });
              beginSvgDrag(event, {
                kind: "group-resize",
                id: item.id,
                corner,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y, width: item.width, height: item.height },
              });
            }}
          />
        ))}
        {controller.diagram.relations.map((sourceRelation) => {
          const relation = displayRelations.get(sourceRelation.id) ?? sourceRelation;
          const fromTable = tableMap.get(sourceRelation.fromTable);
          const toTable = tableMap.get(sourceRelation.toTable);
          if (!fromTable || !toTable) return null;

          return (
            <RelationPath
              key={sourceRelation.id}
              relation={relation}
              fromTable={fromTable}
              toTable={toTable}
              selected={selected?.type === "relation" && selected.id === sourceRelation.id}
              renderedPath={relationPaths.get(sourceRelation.id)}
              onSelect={(item) => controller.setSelected({ type: "relation", id: item.id })}
              onAddViaPoint={addViaPoint}
              onViaPointerDown={(event, item, index) => {
                controller.setSelected({ type: "relation", id: item.id });
                beginSvgDrag(event, { kind: "via", id: item.id, index });
              }}
              onEndpointPointerDown={(event, item, endpoint) => {
                controller.setSelected({ type: "relation", id: item.id });
                beginSvgDrag(event, { kind: "endpoint", id: item.id, endpoint });
              }}
            />
          );
        })}
        {controller.diagram.tables.map((table) => (
          <TableNode
            key={table.id}
            table={table}
            selected={selected?.type === "table" && selected.id === table.id}
            onPointerDown={(event, item) => {
              controller.setSelected({ type: "table", id: item.id });
              beginSvgDrag(event, {
                kind: "table",
                id: item.id,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y },
              });
            }}
            onResizePointerDown={(event, item, corner) => {
              controller.setSelected({ type: "table", id: item.id });
              beginSvgDrag(event, {
                kind: "table-resize",
                id: item.id,
                corner,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y, width: item.width, height: item.height },
              });
            }}
          />
        ))}
      </svg>
      <div
        className={`zoom-controls${zoomPanelDrag ? " is-dragging" : ""}`}
        style={{ left: zoomPanelPosition.x, top: zoomPanelPosition.y }}
        aria-label="Zoom"
      >
        <button
          type="button"
          className="zoom-drag-handle icon-button"
          title="Mover controles de zoom"
          onPointerDown={beginZoomPanelDrag}
          onPointerMove={moveZoomPanel}
          onPointerUp={stopZoomPanelDrag}
          onPointerCancel={stopZoomPanelDrag}
        >
          <GripVertical size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Auto layout"
          onClick={() => void controller.applyAutoLayout()}
        >
          <LayoutTemplate size={16} />
        </button>
        <button type="button" className="icon-button" title="Novo grupo" onClick={controller.addGroup}>
          <FolderPlus size={16} />
        </button>
        <button
          type="button"
          className={`icon-button${controller.snapToGrid ? " is-toggle-active" : ""}`}
          title="Snap no grid"
          aria-pressed={controller.snapToGrid}
          onClick={() => controller.setSnapToGrid(!controller.snapToGrid)}
        >
          <Magnet size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Desfazer"
          onClick={controller.undo}
          disabled={!controller.canUndo}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Refazer"
          onClick={controller.redo}
          disabled={!controller.canRedo}
        >
          <Redo2 size={16} />
        </button>
        <span className="floating-toolbar-divider" aria-hidden="true" />
        <button type="button" className="icon-button" title="Diminuir zoom" onClick={() => zoomAt(1 / 1.2)}>
          <ZoomOut size={16} />
        </button>
        <button type="button" className="icon-button" title="Aumentar zoom" onClick={() => zoomAt(1.2)}>
          <ZoomIn size={16} />
        </button>
        <button type="button" className="icon-button" title="Ajustar ao diagrama" onClick={fitDiagram}>
          <Maximize2 size={16} />
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      </div>
    </>
  );
}

function resizeBoxFromCorner(
  origin: ResizeOrigin,
  corner: ResizeCorner,
  start: Point,
  point: Point,
  minWidth: number,
  minHeight: number,
  snapToGrid: boolean,
  gridSize: number,
): ResizeOrigin {
  const snap = (value: number) => (snapToGrid ? snapValue(value, gridSize) : value);
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (corner.endsWith("w")) {
    left = Math.min(snap(origin.x + dx), right - minWidth);
  } else {
    right = Math.max(snap(right + dx), left + minWidth);
  }

  if (corner.startsWith("n")) {
    top = Math.min(snap(origin.y + dy), bottom - minHeight);
  } else {
    bottom = Math.max(snap(bottom + dy), top + minHeight);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function expandPaintBounds(bounds: ViewBox, gridSize: number): ViewBox {
  const padding = Math.max(256, gridSize * 24);
  const step = Math.max(1, gridSize);
  const x = Math.floor((bounds.x - padding) / step) * step;
  const y = Math.floor((bounds.y - padding) / step) * step;
  const right = Math.ceil((bounds.x + bounds.width + padding) / step) * step;
  const bottom = Math.ceil((bounds.y + bounds.height + padding) / step) * step;

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function clampOverlayPosition(
  position: Point,
  container: Element | null | undefined,
  overlay: Element | null | undefined,
  fallbackSize: { width: number; height: number },
): Point {
  const inset = 8;
  const containerRect = container?.getBoundingClientRect();
  const overlayRect = overlay?.getBoundingClientRect();
  const containerWidth = containerRect?.width ?? fallbackSize.width;
  const containerHeight = containerRect?.height ?? fallbackSize.height;
  const overlayWidth = overlayRect?.width ?? 190;
  const overlayHeight = overlayRect?.height ?? 44;

  return {
    x: clamp(position.x, inset, Math.max(inset, containerWidth - overlayWidth - inset)),
    y: clamp(position.y, inset, Math.max(inset, containerHeight - overlayHeight - inset)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
