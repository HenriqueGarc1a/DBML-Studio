import type { MouseEvent, MutableRefObject, PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Focus, Search, X } from "lucide-react";
import {
  GROUP_LABEL_DEFAULT_X,
  GROUP_LABEL_DEFAULT_Y,
  GROUP_MIN_HEIGHT,
  GROUP_MIN_WIDTH,
  getTableMinHeight,
  TABLE_MIN_WIDTH,
} from "../model/defaults";
import type { Point, TableModel } from "../model/types";
import {
  getRelationColor,
  getRelationFlowColor,
  getTableGroupVisual,
} from "../model/visualSelectors";
import {
  getRelationGeometry,
  getTableBounds,
} from "../utils/geometry";
import { snapValue } from "../utils/grid";
import { buildJumpPath } from "../utils/lineJumps";
import type { RelationPointAlignment } from "../utils/relationPointSnap";
import {
  fitViewBoxToAspect,
  panViewBox,
  unionViewBox,
  zoomViewBox,
  type ViewBox,
} from "../utils/viewport";
import { GroupNode } from "./GroupNode";
import { RelationPath } from "./RelationPath";
import { RelationEndpointHandles } from "./RelationEndpointHandles";
import type { ResizeHandle } from "./ResizeHandles";
import type { DiagramCanvasController } from "./types";
import { CanvasToolbar } from "./CanvasToolbar";
import { TableNode, type RelationFieldEndpoint } from "./TableNode";
import { useRelationEditing, type RelationEditFeedback } from "./useRelationEditing";

interface ResizeOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragState =
  | {
      kind: "table";
      ids: string[];
      start: Point;
      origins: Record<string, Point>;
    }
  | {
      kind: "table-resize";
      id: string;
      handle: ResizeHandle;
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
      kind: "group-label";
      id: string;
      start: Point;
      origin: Point;
    }
  | {
      kind: "group-resize";
      id: string;
      handle: ResizeHandle;
      start: Point;
      origin: ResizeOrigin;
    }
  | {
      kind: "pan";
      pointerStart: Point;
      viewport: ViewBox;
    };

interface SvgCanvasProps {
  controller: DiagramCanvasController;
  svgRef?: MutableRefObject<SVGSVGElement | null>;
}

export function SvgCanvas({ controller, svgRef: externalSvgRef }: SvgCanvasProps) {
  const internalSvgRef = useRef<SVGSVGElement | null>(null);
  const svgRef = externalSvgRef ?? internalSvgRef;
  const [drag, setDrag] = useState<DragState | undefined>();
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [zoomPanelPosition, setZoomPanelPosition] = useState<Point>({ x: 12, y: 12 });
  const [zoomPanelDrag, setZoomPanelDrag] = useState<{ pointerStart: Point; origin: Point } | undefined>();
  const [relationMode, setRelationMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [focusNeighbors, setFocusNeighbors] = useState(false);
  // The first endpoint picked by the user is the referenced (parent) field.
  const [relationSource, setRelationSource] = useState<RelationFieldEndpoint | undefined>();
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
  const selected = controller.selected;
  const focusedTableIds = useMemo(() => {
    if (!focusNeighbors || selected?.type !== "table") return undefined;
    const ids = new Set([selected.id]);
    for (const relation of controller.diagram.relations) {
      if (relation.fromTable === selected.id || relation.toTable === selected.id) {
        ids.add(relation.fromTable);
        ids.add(relation.toTable);
      }
    }
    return ids;
  }, [controller.diagram.relations, focusNeighbors, selected]);
  const selectedRelation = selected?.type === "relation"
    ? controller.diagram.relations.find((relation) => relation.id === selected.id)
    : undefined;
  const selectedRelationFromTable = selectedRelation ? tableMap.get(selectedRelation.fromTable) : undefined;
  const selectedRelationToTable = selectedRelation ? tableMap.get(selectedRelation.toTable) : undefined;
  const gridSize = controller.diagram.visual.gridSize;
  const paintBounds = useMemo(
    () => expandPaintBounds(unionViewBox(computedBounds, viewport), gridSize),
    [computedBounds, gridSize, viewport],
  );
  const relationRenderOrder = useMemo(() => {
    if (selected?.type === "table") {
      const referencedBySelection = controller.diagram.relations.filter((relation) => relation.toTable === selected.id);

      return [
        ...controller.diagram.relations.filter((relation) => relation.toTable !== selected.id),
        ...referencedBySelection,
      ];
    }

    if (selected?.type !== "relation") return controller.diagram.relations;

    const selectedRelation = controller.diagram.relations.find((relation) => relation.id === selected.id);
    if (!selectedRelation) return controller.diagram.relations;

    return [
      ...controller.diagram.relations.filter((relation) => relation.id !== selected.id),
      selectedRelation,
    ];
  }, [controller.diagram.relations, selected]);
  const relationPaths = useMemo(() => {
    const paths = new Map<string, string>();
    const previousPolylines: Point[][] = [];

    for (const relation of relationRenderOrder) {
      const fromTable = tableMap.get(relation.fromTable);
      const toTable = tableMap.get(relation.toTable);
      if (!fromTable || !toTable) continue;

      const geometry = getRelationGeometry(relation, fromTable, toTable);
      paths.set(relation.id, buildJumpPath(geometry.points, previousPolylines));
      previousPolylines.push(geometry.points);
    }

    return paths;
  }, [relationRenderOrder, tableMap]);
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

  useEffect(() => {
    if (!relationSource) return;
    const table = tableMap.get(relationSource.tableId);
    if (!table?.columns.some((column) => column.id === relationSource.columnId)) {
      setRelationSource(undefined);
    }
  }, [relationSource, tableMap]);

  useEffect(() => {
    setSelectedTableIds((current) => current.filter((id) => tableMap.has(id)));
    if (selected?.type !== "table") {
      setFocusNeighbors(false);
      setSelectedTableIds([]);
    }
  }, [selected?.type, tableMap]);

  const toSvgPoint = (event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    return matrix ? point.matrixTransform(matrix) : { x: event.clientX, y: event.clientY };
  };

  const relationEditor = useRelationEditing({ controller, svgRef, toSvgPoint });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (relationEditor.move(event)) return;
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
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      controller.moveTables(drag.ids.map((id) => {
        const origin = drag.origins[id];
        const x = origin.x + dx;
        const y = origin.y + dy;
        return {
          id,
          x: controller.snapToGrid ? snapValue(x, gridSize) : x,
          y: controller.snapToGrid ? snapValue(y, gridSize) : y,
        };
      }));
    }

    if (drag.kind === "table-resize") {
      const table = tableMap.get(drag.id);
      if (!table) return;
      const next = resizeTableWidthFromHandle(
        drag.origin,
        drag.handle,
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

    if (drag.kind === "group-label") {
      const group = controller.diagram.groups.find((item) => item.id === drag.id);
      if (!group) return;
      const nextX = drag.origin.x + point.x - drag.start.x;
      const nextY = drag.origin.y + point.y - drag.start.y;
      const labelPosition = clampGroupLabelPosition(
        {
          x: controller.snapToGrid ? snapValue(nextX, gridSize) : nextX,
          y: controller.snapToGrid ? snapValue(nextY, gridSize) : nextY,
        },
        group.width,
        group.height,
      );

      controller.updateGroup(drag.id, {
        labelX: labelPosition.x,
        labelY: labelPosition.y,
      });
    }

    if (drag.kind === "group-resize") {
      const next = resizeBoxFromCorner(
        drag.origin,
        drag.handle,
        drag.start,
        point,
        GROUP_MIN_WIDTH,
        GROUP_MIN_HEIGHT,
        controller.snapToGrid,
        gridSize,
      );

      controller.updateGroup(drag.id, next);
    }

  };

  const stopDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (relationEditor.finish(event)) return;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.kind === "table") {
      drag.ids.forEach(controller.settleTable);
    }
    if (drag.kind === "table-resize") {
      controller.settleTable(drag.id);
    }
    if (drag.kind !== "pan") {
      controller.endHistoryBatch();
    }
    setDrag(undefined);
  };

  const cancelDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (relationEditor.cancel(event)) return;
    stopDrag(event);
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
    setSelectedTableIds([]);
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

  const fitSelection = () => {
    const selectedTables = controller.diagram.tables.filter((table) => selectedTableIds.includes(table.id));
    if (!selectedTables.length && selected?.type === "table") {
      const table = tableMap.get(selected.id);
      if (table) selectedTables.push(table);
    }
    if (selectedTables.length) setViewport(fitViewBoxToAspect(getTableBounds(selectedTables), canvasSize.width, canvasSize.height));
  };

  const focusTable = (table: TableModel) => {
    controller.setSelected({ type: "table", id: table.id });
    setSelectedTableIds([table.id]);
    const padding = Math.max(80, table.width * 0.45);
    setViewport(fitViewBoxToAspect({
      x: table.x - padding,
      y: table.y - padding,
      width: table.width + padding * 2,
      height: table.height + padding * 2,
    }, canvasSize.width, canvasSize.height));
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

  const selectRelationField = (table: TableModel, column: TableModel["columns"][number]) => {
    if (!relationMode) return;

    const endpoint: RelationFieldEndpoint = {
      tableId: table.id,
      columnId: column.id,
      columnName: column.name,
    };

    if (!relationSource) {
      setRelationSource(endpoint);
      return;
    }

    if (relationSource.tableId === endpoint.tableId && relationSource.columnId === endpoint.columnId) {
      setRelationSource(undefined);
      return;
    }

    controller.addRelation(endpoint.tableId, endpoint.columnName, relationSource.tableId, relationSource.columnName);
    setRelationSource(undefined);
    setRelationMode(false);
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
        className={`diagram-canvas${drag?.kind === "pan" ? " is-panning" : ""}${relationEditor.dragging ? " is-editing-relation" : ""}${relationMode ? " is-relation-mode" : ""}`}
        data-testid="diagram-canvas"
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        data-export-viewbox={`${computedBounds.x} ${computedBounds.y} ${computedBounds.width} ${computedBounds.height}`}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={cancelDrag}
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
          className="canvas-background"
          x={paintBounds.x}
          y={paintBounds.y}
          width={paintBounds.width}
          height={paintBounds.height}
          fill={controller.diagram.visual.backgroundColor}
        />
        <rect
          className="canvas-grid"
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
            onLabelPointerDown={(event, item) => {
              controller.setSelected({ type: "group", id: item.id });
              beginSvgDrag(event, {
                kind: "group-label",
                id: item.id,
                start: toSvgPoint(event),
                origin: {
                  x: Number.isFinite(item.labelX) ? item.labelX : GROUP_LABEL_DEFAULT_X,
                  y: Number.isFinite(item.labelY) ? item.labelY : GROUP_LABEL_DEFAULT_Y,
                },
              });
            }}
            onResizePointerDown={(event, item, corner) => {
              controller.setSelected({ type: "group", id: item.id });
              beginSvgDrag(event, {
                kind: "group-resize",
                id: item.id,
                handle: corner,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y, width: item.width, height: item.height },
              });
            }}
          />
        ))}
        {relationRenderOrder.map((sourceRelation) => {
          const relation = relationEditor.displayRelation(sourceRelation);
          const fromTable = tableMap.get(sourceRelation.fromTable);
          const toTable = tableMap.get(sourceRelation.toTable);
          if (!fromTable || !toTable) return null;
          const highlightedByTable =
            selected?.type === "table" &&
            selected.id === sourceRelation.toTable;
          const flowDirection = highlightedByTable ? "reverse": "forward";
          const flowColor = getRelationFlowColor(
            sourceRelation,
            controller.diagram.tables,
            controller.diagram.visual.defaultTable,
            controller.diagram.groups,
            flowDirection,
          );
          const exportFlowColor = getRelationFlowColor(
            sourceRelation,
            controller.diagram.tables,
            controller.diagram.visual.defaultTable,
            controller.diagram.groups,
            "reverse",
          );
          const relationColor = getRelationColor(
            sourceRelation,
            controller.diagram.tables,
            controller.diagram.visual.defaultTable,
            controller.diagram.groups,
          );
          const focusDimmed = Boolean(focusNeighbors && selected?.type === "table" &&
            sourceRelation.fromTable !== selected.id && sourceRelation.toTable !== selected.id);

          return (
            <RelationPath
              key={sourceRelation.id}
              relation={relation}
              fromTable={fromTable}
              toTable={toTable}
              selected={selected?.type === "relation" && selected.id === sourceRelation.id}
              color={relationColor}
              highlighted={highlightedByTable}
              dimmed={focusDimmed}
              flowDirection={flowDirection}
              flowColor={flowColor}
              exportFlowDirection="reverse"
              exportFlowColor={exportFlowColor}
              renderedPath={relationEditor.relationId === sourceRelation.id ? undefined : relationPaths.get(sourceRelation.id)}
              editing={relationEditor.dragging && relationEditor.relationId === sourceRelation.id}
              constrained={relationEditor.constrained && relationEditor.relationId === sourceRelation.id}
              onSelectPointerDown={relationEditor.selectRelation}
              onSegmentPointPointerDown={(event, item, segmentIndex) =>
                relationEditor.armMidpoint(event, item, fromTable, toTable, segmentIndex)
              }
              onCornerPointPointerDown={(event, item, pointIndex) =>
                relationEditor.armCorner(event, item, fromTable, toTable, pointIndex)
              }
            />
          );
        })}
        {controller.diagram.tables.map((table) => (
          <TableNode
            key={table.id}
            table={table}
            defaultVisual={controller.diagram.visual.defaultTable}
            groupVisual={getTableGroupVisual(table, controller.diagram.groups)}
            badgeVisuals={controller.diagram.visual.badges}
            selected={selectedTableIds.includes(table.id) || (selected?.type === "table" && selected.id === table.id)}
            showResizeHandles={selected?.type === "table" && selected.id === table.id}
            dimmed={Boolean(focusedTableIds && !focusedTableIds.has(table.id))}
            relationObstacle={relationEditor.obstacleTableIds.has(table.id)}
            relationMode={relationMode}
            relationSource={relationSource}
            onPointerDown={(event, item) => {
              const nextIds = event.shiftKey
                ? selectedTableIds.includes(item.id)
                  ? selectedTableIds.filter((id) => id !== item.id)
                  : [...selectedTableIds, item.id]
                : selectedTableIds.includes(item.id) && selectedTableIds.length > 1
                  ? selectedTableIds
                  : [item.id];
              if (!nextIds.length) {
                controller.setSelected(undefined);
                setSelectedTableIds([]);
                return;
              }
              setSelectedTableIds(nextIds);
              controller.setSelected({ type: "table", id: item.id });
              beginSvgDrag(event, {
                kind: "table",
                ids: nextIds,
                start: toSvgPoint(event),
                origins: Object.fromEntries(nextIds.flatMap((id) => {
                  const selectedTable = tableMap.get(id);
                  return selectedTable ? [[id, { x: selectedTable.x, y: selectedTable.y }]] : [];
                })),
              });
            }}
            onColumnPointerDown={(event, item, column) => {
              event.stopPropagation();
              event.preventDefault();
              selectRelationField(item, column);
            }}
            onResizePointerDown={(event, item, corner) => {
              controller.setSelected({ type: "table", id: item.id });
              beginSvgDrag(event, {
                kind: "table-resize",
                id: item.id,
                handle: corner,
                start: toSvgPoint(event),
                origin: { x: item.x, y: item.y, width: item.width, height: item.height },
              });
            }}
          />
        ))}
        {selectedRelation && selectedRelationFromTable && selectedRelationToTable && !relationEditor.active && (
          <RelationEndpointHandles
            relation={selectedRelation}
            fromTable={selectedRelationFromTable}
            toTable={selectedRelationToTable}
            onPointerDown={(event, endpoint) => relationEditor.armEndpoint(
              event,
              selectedRelation,
              selectedRelationFromTable,
              selectedRelationToTable,
              endpoint,
            )}
          />
        )}
        {relationEditor.alignment && <RelationSnapGuides alignment={relationEditor.alignment} />}
        {relationEditor.feedback && <RelationConstraintFeedback feedback={relationEditor.feedback} />}
      </svg>
      <CanvasNavigator
        tables={controller.diagram.tables}
        selectedTableId={selected?.type === "table" ? selected.id : undefined}
        selectedCount={selectedTableIds.length}
        focusNeighbors={focusNeighbors}
        onToggleFocus={() => setFocusNeighbors((value) => !value)}
        onSelect={focusTable}
      />
      <DiagramMinimap
        tables={controller.diagram.tables}
        bounds={computedBounds}
        viewport={viewport}
        selectedIds={new Set(selectedTableIds)}
        onCenter={(point) => setViewport((current) => ({ ...current, x: point.x - current.width / 2, y: point.y - current.height / 2 }))}
      />
      <CanvasToolbar
        position={zoomPanelPosition} dragging={Boolean(zoomPanelDrag)} relationMode={relationMode}
        choosingTarget={Boolean(relationSource)} snapToGrid={controller.snapToGrid}
        canUndo={controller.canUndo} canRedo={controller.canRedo}
        hasRelations={Boolean(controller.diagram.relations.length)} canAutoLayout={controller.diagram.tables.length >= 2}
        onDragStart={beginZoomPanelDrag} onDrag={moveZoomPanel} onDragEnd={stopZoomPanelDrag}
        onUndo={controller.undo} onRedo={controller.redo} onAddTable={controller.addTable} onAddGroup={controller.addGroup}
        onToggleRelation={() => { setRelationMode((active) => !active); setRelationSource(undefined); }}
        onTidy={controller.tidyRelations}
        onAutoLayout={() => void controller.applyAutoLayout().then((laidOut) => setViewport(fitViewBoxToAspect(getTableBounds(laidOut.tables), canvasSize.width, canvasSize.height)))}
        onToggleSnap={() => controller.setSnapToGrid(!controller.snapToGrid)}
        onZoomOut={() => zoomAt(1 / 1.2)} onZoomIn={() => zoomAt(1.2)} onFit={fitDiagram}
        onFitSelection={fitSelection} canFitSelection={Boolean(selectedTableIds.length || selected?.type === "table")}
      />
    </>
  );
}

function CanvasNavigator({ tables, selectedTableId, selectedCount, focusNeighbors, onToggleFocus, onSelect }: {
  tables: TableModel[];
  selectedTableId?: string;
  selectedCount: number;
  focusNeighbors: boolean;
  onToggleFocus(): void;
  onSelect(table: TableModel): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return tables.slice(0, 10);
    return tables.filter((table) => table.name.toLocaleLowerCase().includes(normalized) ||
      table.columns.some((column) => column.name.toLocaleLowerCase().includes(normalized) || column.type.toLocaleLowerCase().includes(normalized))).slice(0, 16);
  }, [query, tables]);
  return <div className={`canvas-navigator${open ? " is-open" : ""}`}>
    <div className="canvas-navigator-bar">
      <button type="button" className="icon-button" title="Buscar tabela ou campo" aria-label="Buscar tabela ou campo" onClick={() => setOpen((value) => !value)}>{open ? <X size={15} /> : <Search size={15} />}</button>
      {open && <label><Search size={14} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tabela ou campo…" /></label>}
      {selectedTableId && <button type="button" className={`icon-button${focusNeighbors ? " is-toggle-active" : ""}`} title="Focar tabela e dependências" aria-pressed={focusNeighbors} onClick={onToggleFocus}><Focus size={15} /></button>}
      {selectedCount > 1 && <span className="canvas-selection-count">{selectedCount} selecionadas</span>}
    </div>
    {open && <div className="canvas-navigator-results">{results.map((table) => {
      const matchingColumns = query.trim() ? table.columns.filter((column) => `${column.name} ${column.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 3) : [];
      return <button type="button" key={table.id} className={table.id === selectedTableId ? "is-active" : ""} onClick={() => { onSelect(table); setOpen(false); }}><strong>{table.name}</strong><small>{matchingColumns.length ? matchingColumns.map((column) => column.name).join(", ") : `${table.columns.length} campos`}</small></button>;
    })}{!results.length && <span className="canvas-navigator-empty">Nada encontrado.</span>}</div>}
  </div>;
}

function DiagramMinimap({ tables, bounds, viewport, selectedIds, onCenter }: {
  tables: TableModel[];
  bounds: ViewBox;
  viewport: ViewBox;
  selectedIds: Set<string>;
  onCenter(point: Point): void;
}) {
  if (tables.length < 2) return null;
  const click = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onCenter({
      x: bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width,
      y: bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height,
    });
  };
  return <div className="diagram-minimap" aria-label="Minimapa do diagrama">
    <svg viewBox={`${bounds.x} ${bounds.y} ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`} preserveAspectRatio="none" onClick={click}>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} className="minimap-background" />
      {tables.map((table) => <rect key={table.id} x={table.x} y={table.y} width={table.width} height={table.height} rx={3} className={selectedIds.has(table.id) ? "minimap-table is-selected" : "minimap-table"} />)}
      <rect x={viewport.x} y={viewport.y} width={viewport.width} height={viewport.height} className="minimap-viewport" />
    </svg>
  </div>;
}

function RelationSnapGuides({ alignment }: { alignment: RelationPointAlignment }) {
  return (
    <g className="relation-snap-guides" data-testid="relation-snap-guides" pointerEvents="none">
      {alignment.horizontal && (
        <line
          x1={alignment.horizontal.anchor.x}
          y1={alignment.horizontal.anchor.y}
          x2={alignment.point.x}
          y2={alignment.point.y}
          className="relation-snap-guide"
          data-snap-axis="horizontal"
        />
      )}
      {alignment.vertical && (
        <line
          x1={alignment.vertical.anchor.x}
          y1={alignment.vertical.anchor.y}
          x2={alignment.point.x}
          y2={alignment.point.y}
          className="relation-snap-guide"
          data-snap-axis="vertical"
        />
      )}
      <circle cx={alignment.point.x} cy={alignment.point.y} r={6.5} className="relation-snap-point" />
    </g>
  );
}

function RelationConstraintFeedback({ feedback }: { feedback: RelationEditFeedback }) {
  const lines = wrapFeedbackMessage(feedback.message);
  const lineHeight = 14;
  const width = Math.max(190, Math.min(310, Math.max(...lines.map((line) => line.length)) * 6.2 + 20));
  const height = lines.length * lineHeight + 12;
  const labelX = feedback.applied.x + 14;
  const labelY = feedback.applied.y - height - 12;
  return (
    <g className="relation-edit-feedback" data-testid="relation-edit-feedback" pointerEvents="none">
      <line
        x1={feedback.requested.x}
        y1={feedback.requested.y}
        x2={feedback.applied.x}
        y2={feedback.applied.y}
        className="relation-constraint-guide"
      />
      <circle cx={feedback.requested.x} cy={feedback.requested.y} r={4} className="relation-requested-point" />
      <circle cx={feedback.applied.x} cy={feedback.applied.y} r={5} className="relation-applied-point" />
      <g transform={`translate(${labelX} ${labelY})`}>
        <rect x={0} y={0} width={width} height={height} rx={7} className="relation-feedback-bubble" />
        <text x={10} y={17} className="relation-feedback-text">
          {lines.map((line, index) => (
            <tspan key={`${line}-${index}`} x={10} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>
          ))}
        </text>
      </g>
    </g>
  );
}

function wrapFeedbackMessage(message: string, maxCharacters = 42): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of message.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharacters || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [message];
}

function resizeTableWidthFromHandle(
  origin: ResizeOrigin,
  handle: ResizeHandle,
  start: Point,
  point: Point,
  minWidth: number,
  height: number,
  snapToGrid: boolean,
  gridSize: number,
): ResizeOrigin {
  const snap = (value: number) => (snapToGrid ? snapValue(value, gridSize) : value);
  const dx = point.x - start.x;
  let left = origin.x;
  let right = origin.x + origin.width;

  if (handle.endsWith("w")) {
    left = Math.min(snap(origin.x + dx), right - minWidth);
  } else {
    right = Math.max(snap(right + dx), left + minWidth);
  }

  return {
    x: left,
    y: origin.y,
    width: right - left,
    height,
  };
}

function resizeBoxFromCorner(
  origin: ResizeOrigin,
  corner: ResizeHandle,
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

function clampGroupLabelPosition(position: Point, groupWidth: number, groupHeight: number): Point {
  return {
    x: clamp(position.x, 6, Math.max(6, groupWidth - 6)),
    y: clamp(position.y, 16, Math.max(16, groupHeight - 8)),
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
