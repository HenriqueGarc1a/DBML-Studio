import type { MouseEvent, MutableRefObject, PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { DiagramController } from "../editor/useDiagramController";
import type { GroupModel, Point, RelationModel, TableModel } from "../model/types";
import {
  getRelationGeometry,
  getTableBounds,
  snapRelationEndpoint,
} from "../utils/geometry";
import { GRID_SIZE, snapPoint, snapValue } from "../utils/grid";
import { buildJumpPath } from "../utils/lineJumps";
import {
  getZoom,
  panViewBox,
  unionViewBox,
  zoomViewBox,
  type ViewBox,
} from "../utils/viewport";
import { GroupNode } from "./GroupNode";
import { RelationPath } from "./RelationPath";
import { TableNode } from "./TableNode";

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
      start: Point;
      width: number;
      height: number;
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
      start: Point;
      width: number;
      height: number;
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
  const paintBounds = unionViewBox(computedBounds, viewport);
  const zoom = getZoom(computedBounds, viewport);
  const selected = controller.selected;
  const relationPaths = useMemo(() => {
    const paths = new Map<string, string>();
    const previousPolylines: Point[][] = [];

    for (const relation of controller.diagram.relations) {
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
  }, [controller.diagram.relations, tableMap]);

  useEffect(() => {
    if (tableSignature !== lastTableSignature) {
      setViewport(computedBounds);
      setLastTableSignature(tableSignature);
      return;
    }

    if (!drag && Math.abs(zoom - 1) < 0.01) {
      setViewport(computedBounds);
    }
  }, [computedBounds, drag, lastTableSignature, tableSignature, zoom]);

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
        x: controller.snapToGrid ? snapValue(nextX) : nextX,
        y: controller.snapToGrid ? snapValue(nextY) : nextY,
        layoutSource: "manual",
      });
    }

    if (drag.kind === "table-resize") {
      const width = drag.width + point.x - drag.start.x;
      const height = drag.height + point.y - drag.start.y;
      controller.resizeTable(
        drag.id,
        controller.snapToGrid ? snapValue(width) : width,
        controller.snapToGrid ? snapValue(height) : height,
      );
    }

    if (drag.kind === "group") {
      const nextX = drag.origin.x + point.x - drag.start.x;
      const nextY = drag.origin.y + point.y - drag.start.y;
      controller.updateGroup(drag.id, {
        x: controller.snapToGrid ? snapValue(nextX) : nextX,
        y: controller.snapToGrid ? snapValue(nextY) : nextY,
      });
    }

    if (drag.kind === "group-resize") {
      const width = drag.width + point.x - drag.start.x;
      const height = drag.height + point.y - drag.start.y;
      controller.resizeGroup(
        drag.id,
        controller.snapToGrid ? snapValue(width) : width,
        controller.snapToGrid ? snapValue(height) : height,
      );
    }

    if (drag.kind === "via") {
      controller.updateViaPoint(drag.id, drag.index, snapPoint(point, controller.snapToGrid));
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
    setDrag(undefined);
  };

  const beginSvgDrag = (event: PointerEvent<SVGElement>, state: DragState) => {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag(state);
  };

  const beginPan = (event: PointerEvent<SVGSVGElement>) => {
    controller.setSelected(undefined);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: "pan",
      pointerStart: { x: event.clientX, y: event.clientY },
      viewport,
    });
  };

  const zoomAt = (factor: number, center?: Point) => {
    setViewport((current) => zoomViewBox(computedBounds, current, factor, center));
  };

  const fitDiagram = () => {
    setViewport(computedBounds);
  };

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, toSvgPoint(event));
  };

  const addViaPoint = (relation: RelationModel, event: MouseEvent<SVGPathElement>) => {
    event.stopPropagation();
    controller.addViaPoint(relation.id, snapPoint(toSvgPoint(event), controller.snapToGrid));
    controller.setSelected({ type: "relation", id: relation.id });
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
          <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
              fill="none"
              stroke="var(--grid-line)"
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
            onResizePointerDown={(event, item) => {
              controller.setSelected({ type: "group", id: item.id });
              beginSvgDrag(event, {
                kind: "group-resize",
                id: item.id,
                start: toSvgPoint(event),
                width: item.width,
                height: item.height,
              });
            }}
          />
        ))}
        {controller.diagram.relations.map((relation) => {
          const fromTable = tableMap.get(relation.fromTable);
          const toTable = tableMap.get(relation.toTable);
          if (!fromTable || !toTable) return null;

          return (
            <RelationPath
              key={relation.id}
              relation={relation}
              fromTable={fromTable}
              toTable={toTable}
              selected={selected?.type === "relation" && selected.id === relation.id}
              renderedPath={relationPaths.get(relation.id)}
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
            onResizePointerDown={(event, item) => {
              controller.setSelected({ type: "table", id: item.id });
              beginSvgDrag(event, {
                kind: "table-resize",
                id: item.id,
                start: toSvgPoint(event),
                width: item.width,
                height: item.height,
              });
            }}
          />
        ))}
      </svg>
      <div className="zoom-controls" aria-label="Zoom">
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
