import type { Point } from "../model/types";

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 12;

export function getZoom(bounds: ViewBox, viewport: ViewBox): number {
  if (viewport.width <= 0 || bounds.width <= 0) return 1;
  return bounds.width / viewport.width;
}

export function zoomViewBox(
  bounds: ViewBox,
  viewport: ViewBox,
  factor: number,
  center: Point = {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  },
): ViewBox {
  const currentZoom = getZoom(bounds, viewport);
  const nextZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM);
  const width = bounds.width / nextZoom;
  const height = bounds.height / nextZoom;
  const relativeX = viewport.width > 0 ? (center.x - viewport.x) / viewport.width : 0.5;
  const relativeY = viewport.height > 0 ? (center.y - viewport.y) / viewport.height : 0.5;

  return {
    x: center.x - width * relativeX,
    y: center.y - height * relativeY,
    width,
    height,
  };
}

export function panViewBox(viewport: ViewBox, dx: number, dy: number): ViewBox {
  return {
    ...viewport,
    x: viewport.x - dx,
    y: viewport.y - dy,
  };
}

export function unionViewBox(a: ViewBox, b: ViewBox): ViewBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    x,
    y,
    width: maxX - x,
    height: maxY - y,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
