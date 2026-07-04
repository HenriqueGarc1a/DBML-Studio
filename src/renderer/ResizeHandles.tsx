import type { PointerEvent } from "react";

export type ResizeHandle = "nw" | "ne" | "sw" | "se" | "w" | "e";

interface ResizeHandlesProps {
  width: number;
  height: number;
  mode?: "corners" | "horizontal";
  onPointerDown: (event: PointerEvent<SVGRectElement>, handle: ResizeHandle) => void;
}

const HANDLE_SIZE = 12;
const HALF_HANDLE = HANDLE_SIZE / 2;

const cornerHandles: ResizeHandle[] = ["nw", "ne", "sw", "se"];
const horizontalHandles: ResizeHandle[] = ["w", "e"];

export function ResizeHandles({ width, height, mode = "corners", onPointerDown }: ResizeHandlesProps) {
  const handles = mode === "horizontal" ? horizontalHandles : cornerHandles;

  return (
    <>
      {handles.map((handle) => (
        <rect
          key={handle}
          className={`resize-handle resize-handle-${handle}`}
          x={handle.endsWith("w") ? -HALF_HANDLE : width - HALF_HANDLE}
          y={handle === "w" || handle === "e" ? height / 2 - HALF_HANDLE : handle.startsWith("n") ? -HALF_HANDLE : height - HALF_HANDLE}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          rx={3}
          onPointerDown={(event) => onPointerDown(event, handle)}
        />
      ))}
    </>
  );
}
