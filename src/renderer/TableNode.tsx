import type { PointerEvent } from "react";
import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT } from "../model/defaults";
import type { BadgeVisual, BadgeVisualSet, ColumnModel, TableModel, TableVisual } from "../model/types";
import { ResizeHandles, type ResizeHandle } from "./ResizeHandles";

export interface RelationFieldEndpoint {
  tableId: string;
  columnId: string;
  columnName: string;
}

interface TableNodeProps {
  table: TableModel;
  defaultVisual: TableVisual;
  badgeVisuals: BadgeVisualSet;
  selected: boolean;
  relationMode: boolean;
  relationSource?: RelationFieldEndpoint;
  onPointerDown: (event: PointerEvent<SVGGElement>, table: TableModel) => void;
  onColumnPointerDown: (
    event: PointerEvent<SVGRectElement>,
    table: TableModel,
    column: ColumnModel,
  ) => void;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, table: TableModel, handle: ResizeHandle) => void;
}

export function TableNode({
  table,
  defaultVisual,
  badgeVisuals,
  selected,
  relationMode,
  relationSource,
  onPointerDown,
  onColumnPointerDown,
  onResizePointerDown,
}: TableNodeProps) {
  const visual = table.usesDefaultStyle ? defaultVisual : table.visual;

  return (
    <g
      className={`table-node${selected ? " is-selected" : ""}`}
      transform={`translate(${table.x} ${table.y})`}
      opacity={visual.opacity}
      onPointerDown={(event) => onPointerDown(event, table)}
    >
      <rect
        width={table.width}
        height={table.height}
        rx={6}
        fill={visual.backgroundColor}
        stroke={selected ? "#2dd4bf" : visual.borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <rect
        width={table.width}
        height={TABLE_HEADER_HEIGHT}
        rx={6}
        fill={visual.headerColor}
      />
      <path
        d={`M 0 ${TABLE_HEADER_HEIGHT} H ${table.width}`}
        stroke={visual.borderColor}
        strokeWidth={1}
      />
      <text
        x={14}
        y={24}
        fill={visual.textColor}
        className="table-title"
      >
        {table.name}
      </text>
      {table.columns.map((column, index) => {
        const y = TABLE_HEADER_HEIGHT + index * TABLE_ROW_HEIGHT;
        const badges = [
          column.primaryKey ? { label: "PK", visual: badgeVisuals.primaryKey } : undefined,
          column.foreignKey ? { label: "FK", visual: badgeVisuals.foreignKey } : undefined,
          !column.nullable ? { label: "NN", visual: badgeVisuals.notNull } : undefined,
          column.unique ? { label: "UQ", visual: badgeVisuals.unique } : undefined,
        ].filter(Boolean) as Array<{ label: string; visual: BadgeVisual }>;
        const badgeGap = 4;
        const badgeWidth = 22;
        const badgeStackWidth = badges.length * badgeWidth + Math.max(0, badges.length - 1) * badgeGap;
        const badgeStartX = table.width - 12 - badgeStackWidth;
        const typeX = badges.length ? badgeStartX - 8 : table.width - 14;
        const isRelationSource =
          relationSource?.tableId === table.id && relationSource.columnId === column.id;
        const isLastColumn = index === table.columns.length - 1;

        return (
          <g key={column.id} transform={`translate(0 ${y})`}>
            {!isLastColumn && (
              <line x1={0} x2={table.width} y1={TABLE_ROW_HEIGHT} y2={TABLE_ROW_HEIGHT} className="row-line" />
            )}
            {isRelationSource && (
              <rect
                x={1}
                y={1}
                width={Math.max(0, table.width - 2)}
                height={TABLE_ROW_HEIGHT - 2}
                className="column-relation-source"
              />
            )}
            <text x={14} y={18} fill={visual.textColor} className="column-name">
              {column.name}
            </text>
            <text x={typeX} y={18} fill={visual.textColor} className="column-type">
              {column.type}
            </text>
            {badges.map((badge, badgeIndex) => (
              <Badge
                key={badge.label}
                x={badgeStartX + badgeIndex * (badgeWidth + badgeGap)}
                y={6}
                label={badge.label}
                visual={badge.visual}
              />
            ))}
            {relationMode && (
              <rect
                x={0}
                y={0}
                width={table.width}
                height={TABLE_ROW_HEIGHT}
                className="column-hitbox"
                onPointerDown={(event) => onColumnPointerDown(event, table, column)}
              />
            )}
          </g>
        );
      })}
      {selected && (
        <ResizeHandles
          mode="horizontal"
          width={table.width}
          height={table.height}
          onPointerDown={(event, handle) => onResizePointerDown(event, table, handle)}
        />
      )}
    </g>
  );
}

function Badge({ x, y, label, visual }: { x: number; y: number; label: string; visual: BadgeVisual }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={22} height={16} rx={4} fill={visual.backgroundColor} stroke={visual.borderColor} />
      <text x={11} y={11.5} textAnchor="middle" fill={visual.textColor} className="badge-text">
        {label}
      </text>
    </g>
  );
}
