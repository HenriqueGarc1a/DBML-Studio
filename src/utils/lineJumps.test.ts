import { describe, expect, it } from "vitest";
import { buildJumpPath, findJumps } from "./lineJumps";

describe("line jumps", () => {
  it("detects crossings against previous polylines", () => {
    const jumps = findJumps(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
    );

    expect(jumps).toHaveLength(1);
    expect(jumps[0].point).toEqual({ x: 50, y: 50 });
  });

  it("draws a quadratic bridge at crossings", () => {
    const path = buildJumpPath(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      ],
      10,
    );

    expect(path).toContain("Q");
    expect(path).toContain("L 40 50");
    expect(path).toContain("60 50");
  });
});
