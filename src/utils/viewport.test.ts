import { describe, expect, it } from "vitest";
import { MAX_ZOOM, getZoom, panViewBox, unionViewBox, zoomViewBox } from "./viewport";

const bounds = { x: 0, y: 0, width: 1000, height: 800 };

describe("viewport", () => {
  it("zooms around a chosen point", () => {
    const viewport = zoomViewBox(bounds, bounds, 2, { x: 250, y: 200 });

    expect(getZoom(bounds, viewport)).toBe(2);
    expect(viewport).toEqual({
      x: 125,
      y: 100,
      width: 500,
      height: 400,
    });
  });

  it("allows deep zoom while clamping at the maximum", () => {
    const viewport = zoomViewBox(bounds, bounds, 40, { x: 500, y: 400 });

    expect(MAX_ZOOM).toBe(12);
    expect(getZoom(bounds, viewport)).toBe(12);
  });

  it("pans by SVG-space deltas", () => {
    expect(panViewBox(bounds, 20, -10)).toEqual({
      x: -20,
      y: 10,
      width: 1000,
      height: 800,
    });
  });

  it("unions two view boxes", () => {
    expect(unionViewBox(bounds, { x: -100, y: 20, width: 200, height: 900 })).toEqual({
      x: -100,
      y: 0,
      width: 1100,
      height: 920,
    });
  });
});
