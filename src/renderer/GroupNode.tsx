import type { PointerEvent } from "react";
import type { GroupModel } from "../model/types";

interface GroupNodeProps {
  group: GroupModel;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, group: GroupModel) => void;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, group: GroupModel) => void;
}

export function GroupNode({ group, selected, onPointerDown, onResizePointerDown }: GroupNodeProps) {
  return (
    <g
      className={`group-node${selected ? " is-selected" : ""}`}
      transform={`translate(${group.x} ${group.y})`}
      onPointerDown={(event) => onPointerDown(event, group)}
    >
      <rect
        width={group.width}
        height={group.height}
        rx={8}
        fill={group.backgroundColor}
        fillOpacity={group.opacity}
        stroke={selected ? "#111827" : group.borderColor}
        strokeWidth={selected ? 2 : 1.4}
        strokeDasharray={selected ? "8 5" : undefined}
      />
      <text x={12} y={24} fill={group.borderColor} className="group-label">
        {group.label}
      </text>
      {selected && (
        <rect
          className="resize-handle"
          x={group.width - 10}
          y={group.height - 10}
          width={10}
          height={10}
          rx={2}
          onPointerDown={(event) => onResizePointerDown(event, group)}
        />
      )}
    </g>
  );
}
