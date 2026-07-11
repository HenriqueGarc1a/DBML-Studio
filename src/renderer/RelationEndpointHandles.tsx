import type { PointerEvent } from "react";
import type { Point, RelationModel, TableModel } from "../model/types";
import { getColumnPoint, normalizeRelationSide } from "../utils/geometry";

interface RelationEndpointHandlesProps {
  relation: RelationModel;
  fromTable: TableModel;
  toTable: TableModel;
  onPointerDown(
    event: PointerEvent<SVGElement>,
    endpoint: "from" | "to",
  ): void;
}

export function RelationEndpointHandles({
  relation,
  fromTable,
  toTable,
  onPointerDown,
}: RelationEndpointHandlesProps) {
  const fromSide = normalizeRelationSide(relation.fromSide);
  const toSide = normalizeRelationSide(relation.toSide);
  const from = getColumnPoint(fromTable, relation.fromColumn, fromSide);
  const to = getColumnPoint(toTable, relation.toColumn, toSide);

  return (
    <g className="relation-endpoint-handles">
      <EndpointHandle
        point={from}
        side={fromSide}
        endpoint="from"
        label="Arraste para trocar o lado de encaixe na tabela de origem"
        onPointerDown={onPointerDown}
      />
      <EndpointHandle
        point={to}
        side={toSide}
        endpoint="to"
        label="Arraste para trocar o lado de encaixe na tabela de destino"
        onPointerDown={onPointerDown}
      />
    </g>
  );
}

function EndpointHandle({
  point,
  side,
  endpoint,
  label,
  onPointerDown,
}: {
  point: Point;
  side: "east" | "west" | "north" | "south";
  endpoint: "from" | "to";
  label: string;
  onPointerDown(event: PointerEvent<SVGElement>, endpoint: "from" | "to"): void;
}) {
  const direction = side === "west" ? -1 : 1;
  return (
    <g
      className="relation-endpoint-handle"
      transform={`translate(${point.x} ${point.y})`}
      data-testid="relation-endpoint-handle"
      data-endpoint={endpoint}
      data-side={side}
      onPointerDown={(event) => onPointerDown(event, endpoint)}
    >
      <title>{label}</title>
      <circle className="relation-endpoint-hitbox" r={14} />
      <line x1={direction * 3} y1={0} x2={direction * 10} y2={0} className="relation-endpoint-stem" />
      <circle className="relation-endpoint-control" r={6} />
    </g>
  );
}
