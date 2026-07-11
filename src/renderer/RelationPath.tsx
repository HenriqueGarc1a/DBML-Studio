import type { PointerEvent } from "react";
import { useState } from "react";
import type { RelationModel, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { buildJumpPath } from "../utils/lineJumps";
import { relationSegmentLength, relationSegmentOrientation } from "../utils/relationInteraction";

interface RelationPathProps {
  relation: RelationModel;
  fromTable: TableModel;
  toTable: TableModel;
  selected: boolean;
  color: string;
  highlighted?: boolean;
  flowDirection?: "forward" | "reverse";
  flowColor?: string;
  exportFlowDirection?: "forward" | "reverse";
  exportFlowColor?: string;
  renderedPath?: string;
  editing?: boolean;
  constrained?: boolean;
  onSelectPointerDown: (event: PointerEvent<SVGElement>, relation: RelationModel) => void;
  onSegmentPointPointerDown: (
    event: PointerEvent<SVGElement>,
    relation: RelationModel,
    index: number,
  ) => void;
  onCornerPointPointerDown: (event: PointerEvent<SVGElement>, relation: RelationModel, index: number) => void;
}

export function RelationPath({
  relation,
  fromTable,
  toTable,
  selected,
  color,
  highlighted = false,
  flowDirection = "forward",
  flowColor,
  exportFlowDirection,
  exportFlowColor,
  renderedPath,
  editing = false,
  constrained = false,
  onSelectPointerDown,
  onSegmentPointPointerDown,
  onCornerPointPointerDown,
}: RelationPathProps) {
  const [hoveredSegment, setHoveredSegment] = useState<number>();
  const geometry = getRelationGeometry(relation, fromTable, toTable);
  const path = renderedPath ?? geometry.path;
  const dash = relation.style === "dashed" ? "9 7" : relation.style === "dotted" ? "1 7" : undefined;
  const lineCap = relation.style === "dotted" ? "round" : "butt";
  const start = geometry.points[0];
  const end = geometry.points[geometry.points.length - 1];
  const startCardinalityPoint = cardinalityPoint(start, geometry.points[1] ?? end);
  const endCardinalityPoint = cardinalityPoint(end, geometry.points[geometry.points.length - 2] ?? start);
  const strokeColor = selected ? "#0f766e" : highlighted ? brightenHex(color, 0.38) : color;
  const flowPoints = flowDirection === "reverse" ? [...geometry.points].reverse() : geometry.points;
  const flowPath = highlighted ? buildJumpPath(flowPoints, [], 10, 14) : "";
  const flowLength = highlighted ? polylineLength(flowPoints) : 0;
  const flowArrowCount = highlighted ? getFlowArrowCount(flowLength) : 0;
  const flowDuration = Math.max(0.9, flowLength / 180);
  const arrowColor = flowColor ?? strokeColor;
  const pdfFlowDirection = exportFlowDirection ?? flowDirection;
  const pdfFlowColor = exportFlowColor ?? arrowColor;

  return (
    <g
      className={`relation-path${selected ? " is-selected" : ""}${highlighted ? " is-table-highlighted" : ""}${editing ? " is-editing" : ""}${constrained ? " is-constrained" : ""}`}
      data-relation-id={relation.id}
      data-route-points={JSON.stringify(geometry.points)}
      data-drag-state={editing ? "dragging" : "idle"}
      data-blocked={constrained ? "true" : "false"}
      data-export-flow-direction={pdfFlowDirection}
      data-export-flow-color={pdfFlowColor}
    >
      {highlighted && (
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={relation.strokeWidth + 7}
          strokeOpacity="0.16"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
          className="relation-highlight-glow"
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected || highlighted ? relation.strokeWidth + 1 : relation.strokeWidth}
        strokeOpacity={highlighted ? Math.min(1, relation.opacity + 0.18) : relation.opacity}
        strokeDasharray={dash}
        strokeLinecap={lineCap}
        strokeLinejoin="round"
        className="relation-stroke"
        pointerEvents="none"
      />
      {!editing && hoveredSegment !== undefined && geometry.points[hoveredSegment + 1] && (
        <path
          d={segmentPath(geometry.points[hoveredSegment], geometry.points[hoveredSegment + 1])}
          fill="none"
          className="relation-segment-highlight"
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
          data-testid="relation-segment-highlight"
        />
      )}
      {Array.from({ length: flowArrowCount }, (_, index) => (
        <g key={`${relation.id}-flow-${index}`} className="relation-flow-arrow" style={{ color: arrowColor }}>
          <path d="M -8 -4.5 L 2 0 L -8 4.5" className="relation-flow-arrow-outline" />
          <path d="M -8 -4.5 L 2 0 L -8 4.5" className="relation-flow-arrow-stroke" />
          <animateMotion
            dur={`${flowDuration}s`}
            repeatCount="indefinite"
            rotate="auto"
            path={flowPath}
            begin={`${-index * (flowDuration / Math.max(1, flowArrowCount))}s`}
          />
        </g>
      ))}
      {relation.label && (
        <text x={geometry.labelPoint.x} y={geometry.labelPoint.y - 8} className="relation-label">
          {relation.label}
        </text>
      )}
      <text x={startCardinalityPoint.x} y={startCardinalityPoint.y} className="relation-cardinality">
        {cardinalityLabel(relation.fromCardinality)}
      </text>
      <text x={endCardinalityPoint.x} y={endCardinalityPoint.y} className="relation-cardinality">
        {cardinalityLabel(relation.toCardinality)}
      </text>
      {!editing && geometry.points.slice(0, -1).map((point, index) => {
        const next = geometry.points[index + 1];
        const orientation = relationSegmentOrientation(geometry.points, index);
        const editable = relationSegmentLength(geometry.points, index) >= 36;
        return (
          <path
            key={`${relation.id}-hitbox-${index}`}
            d={segmentPath(point, next)}
            fill="none"
            stroke="transparent"
            strokeWidth={18}
            vectorEffect="non-scaling-stroke"
            className={`relation-segment-hitbox is-${orientation}`}
            data-testid="relation-segment"
            data-relation-id={relation.id}
            data-segment-index={index}
            data-orientation={orientation}
            data-editable={editable ? "true" : "false"}
            onPointerEnter={() => setHoveredSegment(index)}
            onPointerLeave={() => setHoveredSegment((current) => current === index ? undefined : current)}
            onPointerDown={(event) => onSelectPointerDown(event, relation)}
          >
            <title>Clique para selecionar; use os pontos para ajustar a linha</title>
          </path>
        );
      })}
      {selected && !editing && (
        <g className="relation-edit-handles">
          {geometry.points.slice(0, -1).map((point, index) => {
            const next = geometry.points[index + 1];
            if (relationSegmentLength(geometry.points, index) < 36) return null;
            const middle = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
            const orientation = relationSegmentOrientation(geometry.points, index);
            return (
              <g
                key={`${relation.id}-segment-${index}`}
                className="segment-handle"
                transform={`translate(${middle.x} ${middle.y})`}
                data-testid="relation-segment-handle"
                data-segment-index={index}
                onPointerEnter={() => setHoveredSegment(index)}
                onPointerLeave={() => setHoveredSegment((current) => current === index ? undefined : current)}
                onPointerDown={(event) => onSegmentPointPointerDown(event, relation, index)}
              >
                <title>Arraste livremente para criar um novo ponto nesta parte da linha</title>
                <circle className="segment-handle-hitbox" r={13} />
                <circle className="relation-point-control" r={5.5} />
              </g>
            );
          })}
          {geometry.points.slice(1, -1).map((point, index) => (
            <g
              key={`${relation.id}-corner-${index + 1}`}
              className="corner-point-handle"
              transform={`translate(${point.x} ${point.y})`}
              data-testid="relation-corner-handle"
              data-point-index={index + 1}
              onPointerDown={(event) => onCornerPointPointerDown(event, relation, index + 1)}
            >
              <title>Arraste para mover esta curva</title>
              <circle className="corner-point-hitbox" r={13} />
              <circle className="relation-point-control" r={5.5} />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

function segmentPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

function cardinalityLabel(value: RelationModel["fromCardinality"]): string {
  return value === "many" ? "N" : "1";
}

function getFlowArrowCount(length: number): number {
  if (length < 12) return 0;
  if (length > 320) return 4;
  if (length > 140) return 3;
  return 2;
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  return points.slice(0, -1).reduce((total, point, index) => {
    const next = points[index + 1];
    return total + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function brightenHex(hex: string, amount: number): string {
  const normalized = hex.trim();
  const match = normalized.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return "#5eead4";
  const value = match[1];
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const next = channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${next}`;
}

function cardinalityPoint(endpoint: { x: number; y: number }, neighbor: { x: number; y: number }): { x: number; y: number } {
  const dx = neighbor.x - endpoint.x;
  const dy = neighbor.y - endpoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  const normal = { x: -along.y, y: along.x };
  return {
    x: endpoint.x + along.x * 18 + normal.x * 8,
    y: endpoint.y + along.y * 18 + normal.y * 8 + 4,
  };
}
