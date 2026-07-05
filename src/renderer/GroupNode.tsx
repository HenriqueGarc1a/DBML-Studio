import type { PointerEvent } from "react";
import { GROUP_LABEL_DEFAULT_X, GROUP_LABEL_DEFAULT_Y } from "../model/defaults";
import type { GroupModel } from "../model/types";
import { ResizeHandles, type ResizeHandle } from "./ResizeHandles";

interface GroupNodeProps {
  group: GroupModel;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, group: GroupModel) => void;
  onLabelPointerDown: (event: PointerEvent<SVGElement>, group: GroupModel) => void;
  onResizePointerDown: (event: PointerEvent<SVGRectElement>, group: GroupModel, handle: ResizeHandle) => void;
}

export function GroupNode({ group, selected, onPointerDown, onLabelPointerDown, onResizePointerDown }: GroupNodeProps) {
  const labelHitboxWidth = Math.max(80, group.label.length * 8 + 18);
  const labelX = Number.isFinite(group.labelX) ? group.labelX : GROUP_LABEL_DEFAULT_X;
  const labelY = Number.isFinite(group.labelY) ? group.labelY : GROUP_LABEL_DEFAULT_Y;
  const textColor = group.textColor || group.borderColor;

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
      <rect
        x={labelX - 8}
        y={labelY - 18}
        width={labelHitboxWidth}
        height={26}
        className="group-label-hitbox"
        onPointerDown={(event) => onLabelPointerDown(event, group)}
      />
      <text
        x={labelX}
        y={labelY}
        fill={textColor}
        className="group-label"
        onPointerDown={(event) => onLabelPointerDown(event, group)}
      >
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
