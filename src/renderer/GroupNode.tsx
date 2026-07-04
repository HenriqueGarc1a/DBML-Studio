import type { PointerEvent } from "react";
import type { GroupModel } from "../model/types";
import { ResizeHandles, type ResizeCorner } from "./ResizeHandles";

interface GroupNodeProps {
  group: GroupModel;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, group: GroupModel) => void;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, group: GroupModel, corner: ResizeCorner) => void;
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
        stroke={selected ? "#5eead4" : group.borderColor}
        strokeWidth={selected ? 2 : 1.4}
        strokeDasharray={selected ? "8 5" : undefined}
      />
      <text x={12} y={24} fill={group.borderColor} className="group-label">
        {group.label}
      </text>
      {selected && (
        <ResizeHandles
          width={group.width}
          height={group.height}
          onPointerDown={(event, corner) => onResizePointerDown(event, group, corner)}
        />
      )}
    </g>
  );
}
