import type { PointerEvent } from "react";
import { TABLE_HEADER_HEIGHT, TABLE_ROW_HEIGHT } from "../model/defaults";
import type { TableModel } from "../model/types";
import { ResizeHandles, type ResizeCorner } from "./ResizeHandles";

type BadgeTone = "amber" | "teal" | "rose";

interface TableNodeProps {
  table: TableModel;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, table: TableModel) => void;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, table: TableModel, corner: ResizeCorner) => void;
}

export function TableNode({ table, selected, onPointerDown, onResizePointerDown }: TableNodeProps) {
  return (
    <g
      className={`table-node${selected ? " is-selected" : ""}`}
      transform={`translate(${table.x} ${table.y})`}
      opacity={table.visual.opacity}
      onPointerDown={(event) => onPointerDown(event, table)}
    >
      <rect
        width={table.width}
        height={table.height}
        rx={6}
        fill={table.visual.backgroundColor}
        stroke={selected ? "#2dd4bf" : table.visual.borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <rect
        width={table.width}
        height={TABLE_HEADER_HEIGHT}
        rx={6}
        fill={table.visual.headerColor}
      />
      <path
        d={`M 0 ${TABLE_HEADER_HEIGHT} H ${table.width}`}
        stroke={table.visual.borderColor}
        strokeWidth={1}
      />
      <text
        x={14}
        y={24}
        fill={table.visual.textColor}
        className="table-title"
      >
        {table.name}
      </text>
      {table.columns.map((column, index) => {
        const y = TABLE_HEADER_HEIGHT + index * TABLE_ROW_HEIGHT;
        const badges = [
          column.primaryKey ? { label: "PK", tone: "amber" as const } : undefined,
          column.foreignKey ? { label: "FK", tone: "teal" as const } : undefined,
          !column.nullable ? { label: "NN", tone: "rose" as const } : undefined,
        ].filter(Boolean) as Array<{ label: string; tone: BadgeTone }>;
        const badgeGap = 4;
        const badgeWidth = 22;
        const badgeStackWidth = badges.length * badgeWidth + Math.max(0, badges.length - 1) * badgeGap;
        const badgeStartX = table.width - 12 - badgeStackWidth;
        const typeX = badges.length ? badgeStartX - 8 : table.width - 14;

        return (
          <g key={column.id} transform={`translate(0 ${y})`}>
            <line x1={0} x2={table.width} y1={TABLE_ROW_HEIGHT} y2={TABLE_ROW_HEIGHT} className="row-line" />
            <text x={14} y={18} fill={table.visual.textColor} className="column-name">
              {column.name}
            </text>
            <text x={typeX} y={18} fill={table.visual.textColor} className="column-type">
              {column.type}
            </text>
            {badges.map((badge, badgeIndex) => (
              <Badge
                key={badge.label}
                x={badgeStartX + badgeIndex * (badgeWidth + badgeGap)}
                y={6}
                label={badge.label}
                tone={badge.tone}
              />
            ))}
          </g>
        );
      })}
      {selected && (
        <ResizeHandles
          width={table.width}
          height={table.height}
          onPointerDown={(event, corner) => onResizePointerDown(event, table, corner)}
        />
      )}
    </g>
  );
}

function Badge({ x, y, label, tone }: { x: number; y: number; label: string; tone: BadgeTone }) {
  const colors = tone === "amber"
    ? { fill: "#3f2d12", stroke: "#f59e0b", text: "#fcd34d" }
    : tone === "teal"
      ? { fill: "#12312e", stroke: "#2dd4bf", text: "#99f6e4" }
      : { fill: "#3b1620", stroke: "#fb7185", text: "#fecdd3" };

  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={22} height={16} rx={4} fill={colors.fill} stroke={colors.stroke} />
      <text x={11} y={11.5} textAnchor="middle" fill={colors.text} className="badge-text">
        {label}
      </text>
    </g>
  );
}
