import type { PointerEvent } from "react";
import type { RelationModel, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { buildJumpPath } from "../utils/lineJumps";

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
  onPathPointerDown: (event: PointerEvent<SVGPathElement>, relation: RelationModel) => void;
  onSegmentPointerDown: (event: PointerEvent<SVGGElement>, relation: RelationModel, index: number) => void;
  onCornerPointerDown: (event: PointerEvent<SVGRectElement>, relation: RelationModel, index: number) => void;
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
  onPathPointerDown,
  onSegmentPointerDown,
  onCornerPointerDown,
}: RelationPathProps) {
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
      className={`relation-path${selected ? " is-selected" : ""}${highlighted ? " is-table-highlighted" : ""}`}
      data-export-flow-direction={pdfFlowDirection}
      data-export-flow-color={pdfFlowColor}
    >
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(12, relation.strokeWidth + 8)}
        className="relation-hitbox"
        onPointerDown={(event) => onPathPointerDown(event, relation)}
      />
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
      <text
        x={startCardinalityPoint.x}
        y={startCardinalityPoint.y}
        className="relation-cardinality"
      >
        {cardinalityLabel(relation.fromCardinality)}
      </text>
      <text
        x={endCardinalityPoint.x}
        y={endCardinalityPoint.y}
        className="relation-cardinality"
      >
        {cardinalityLabel(relation.toCardinality)}
      </text>
      {selected && (
        <g className="relation-edit-handles">
          {geometry.points.slice(0, -1).map((point, index) => {
            const next = geometry.points[index + 1];
            if (Math.hypot(next.x - point.x, next.y - point.y) < 24) return null;
            const middle = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
            const horizontal = Math.abs(next.x - point.x) >= Math.abs(next.y - point.y);
            return (
              <g
                key={`${relation.id}-segment-${index}`}
                className={`segment-handle is-${horizontal ? "horizontal" : "vertical"}`}
                transform={`translate(${middle.x} ${middle.y})`}
                onPointerDown={(event) => onSegmentPointerDown(event, relation, index)}
              >
                <title>Arraste para mover este trecho</title>
                <circle r={6} />
                <path d={horizontal ? "M -3 0 H 3" : "M 0 -3 V 3"} />
              </g>
            );
          })}
          {geometry.points.slice(1, -1).map((point, index) => (
            <rect
              key={`${relation.id}-corner-${index + 1}`}
              x={point.x - 5}
              y={point.y - 5}
              width={10}
              height={10}
              rx={2}
              transform={`rotate(45 ${point.x} ${point.y})`}
              className="corner-handle"
              onPointerDown={(event) => onCornerPointerDown(event, relation, index + 1)}
            >
              <title>Arraste para mover esta curva</title>
            </rect>
          ))}
        </g>
      )}
    </g>
  );
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
  const along = {
    x: dx / length,
    y: dy / length,
  };
  const normal = {
    x: -along.y,
    y: along.x,
  };

  return {
    x: endpoint.x + along.x * 18 + normal.x * 8,
    y: endpoint.y + along.y * 18 + normal.y * 8 + 4,
  };
}
