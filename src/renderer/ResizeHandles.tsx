import type { PointerEvent } from "react";

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

interface ResizeHandlesProps {
  width: number;
  height: number;
  onPointerDown: (event: PointerEvent<SVGRectElement>, corner: ResizeCorner) => void;
}

const HANDLE_SIZE = 12;
const HALF_HANDLE = HANDLE_SIZE / 2;

const corners: ResizeCorner[] = ["nw", "ne", "sw", "se"];

export function ResizeHandles({ width, height, onPointerDown }: ResizeHandlesProps) {
  return (
    <>
      {corners.map((corner) => (
        <rect
          key={corner}
          className={`resize-handle resize-handle-${corner}`}
          x={corner.endsWith("w") ? -HALF_HANDLE : width - HALF_HANDLE}
          y={corner.startsWith("n") ? -HALF_HANDLE : height - HALF_HANDLE}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          rx={3}
          onPointerDown={(event) => onPointerDown(event, corner)}
        />
      ))}
    </>
  );
}
