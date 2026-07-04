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
