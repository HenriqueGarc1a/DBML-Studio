import { describe, expect, it } from "vitest";
import { GRID_SIZE, snapPoint, snapValue } from "./grid";

describe("grid snapping", () => {
  it("uses a 4px default grid for finer movement", () => {
    expect(GRID_SIZE).toBe(4);
    expect(snapValue(9)).toBe(8);
  });

  it("snaps values to the nearest grid line", () => {
    expect(snapValue(15, 32)).toBe(0);
    expect(snapValue(17, 32)).toBe(32);
    expect(snapValue(49, 32)).toBe(64);
  });

  it("snaps points only when enabled", () => {
    expect(snapPoint({ x: 47, y: 81 }, true, 32)).toEqual({ x: 32, y: 96 });
    expect(snapPoint({ x: 47, y: 81 }, false, 32)).toEqual({ x: 47, y: 81 });
  });
});
