import type { MouseEvent, PointerEvent } from "react";
import type { RelationModel, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";

interface RelationPathProps {
  relation: RelationModel;
  fromTable: TableModel;
  toTable: TableModel;
  selected: boolean;
  renderedPath?: string;
  onSelect: (relation: RelationModel) => void;
  onAddViaPoint: (relation: RelationModel, event: MouseEvent<SVGPathElement>) => void;
  onViaPointerDown: (
    event: PointerEvent<SVGCircleElement>,
    relation: RelationModel,
    index: number,
  ) => void;
  onEndpointPointerDown: (
    event: PointerEvent<SVGRectElement>,
    relation: RelationModel,
    endpoint: "start" | "end",
  ) => void;
}

export function RelationPath({
  relation,
  fromTable,
  toTable,
  selected,
  renderedPath,
  onSelect,
  onAddViaPoint,
  onViaPointerDown,
  onEndpointPointerDown,
}: RelationPathProps) {
  const geometry = getRelationGeometry(relation, fromTable, toTable);
  const path = renderedPath ?? geometry.path;
  const dash = relation.style === "dashed" ? "9 7" : relation.style === "dotted" ? "1 7" : undefined;
  const lineCap = relation.style === "dotted" ? "round" : "butt";
  const start = geometry.points[0];
  const end = geometry.points[geometry.points.length - 1];
  const startCardinalityPoint = cardinalityPoint(start, geometry.points[1] ?? end);
  const endCardinalityPoint = cardinalityPoint(end, geometry.points[geometry.points.length - 2] ?? start);
  const strokeColor = selected ? "#0f766e" : relation.color;

  return (
    <g className={`relation-path${selected ? " is-selected" : ""}`}>
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(12, relation.strokeWidth + 8)}
        className="relation-hitbox"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(relation);
        }}
        onDoubleClick={(event) => onAddViaPoint(relation, event)}
      />
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? relation.strokeWidth + 1 : relation.strokeWidth}
        strokeOpacity={relation.opacity}
        strokeDasharray={dash}
        strokeLinecap={lineCap}
        strokeLinejoin="miter"
        pointerEvents="none"
      />
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
        <>
          <EndpointHandle
            point={start}
            onPointerDown={(event) => onEndpointPointerDown(event, relation, "start")}
          />
          <EndpointHandle
            point={end}
            onPointerDown={(event) => onEndpointPointerDown(event, relation, "end")}
          />
          {relation.viaPoints.map((point, index) => (
            <circle
              key={`${relation.id}-${index}`}
              cx={point.x}
              cy={point.y}
              r={6}
              className="via-handle"
              onPointerDown={(event) => onViaPointerDown(event, relation, index)}
            />
          ))}
        </>
      )}
    </g>
  );
}

function cardinalityLabel(value: RelationModel["fromCardinality"]): string {
  return value === "many" ? "n" : "1";
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

function EndpointHandle({
  point,
  onPointerDown,
}: {
  point: { x: number; y: number };
  onPointerDown: (event: PointerEvent<SVGRectElement>) => void;
}) {
  return (
    <rect
      x={point.x - 5}
      y={point.y - 5}
      width={10}
      height={10}
      rx={2}
      className="endpoint-handle"
      onPointerDown={onPointerDown}
    />
  );
}
