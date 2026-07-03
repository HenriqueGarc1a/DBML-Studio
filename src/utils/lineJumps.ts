import type { Point } from "../model/types";

interface SegmentJump {
  segmentIndex: number;
  point: Point;
  t: number;
}

const EPSILON = 0.0001;
const MIN_ENDPOINT_DISTANCE = 18;

export function buildJumpPath(
  points: Point[],
  crossingPolylines: Point[][],
  jumpRadius = 10,
): string {
  if (points.length < 2) return "";

  const jumps = findJumps(points, crossingPolylines, jumpRadius);
  const bySegment = new Map<number, SegmentJump[]>();

  for (const jump of jumps) {
    const current = bySegment.get(jump.segmentIndex) ?? [];
    current.push(jump);
    bySegment.set(jump.segmentIndex, current);
  }

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentJumps = (bySegment.get(index) ?? []).sort((a, b) => a.t - b.t);
    const vector = normalize({ x: end.x - start.x, y: end.y - start.y });
    const normal = { x: vector.y, y: -vector.x };

    for (const jump of segmentJumps) {
      const before = {
        x: jump.point.x - vector.x * jumpRadius,
        y: jump.point.y - vector.y * jumpRadius,
      };
      const after = {
        x: jump.point.x + vector.x * jumpRadius,
        y: jump.point.y + vector.y * jumpRadius,
      };
      const control = {
        x: jump.point.x + normal.x * jumpRadius,
        y: jump.point.y + normal.y * jumpRadius,
      };

      path += ` L ${round(before.x)} ${round(before.y)}`;
      path += ` Q ${round(control.x)} ${round(control.y)} ${round(after.x)} ${round(after.y)}`;
    }

    path += ` L ${round(end.x)} ${round(end.y)}`;
  }

  return path;
}

export function findJumps(
  points: Point[],
  crossingPolylines: Point[][],
  jumpRadius = 10,
): SegmentJump[] {
  const jumps: SegmentJump[] = [];

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const segmentLength = distance(start, end);

    if (segmentLength < jumpRadius * 2 + MIN_ENDPOINT_DISTANCE) continue;

    for (const polyline of crossingPolylines) {
      for (let otherIndex = 0; otherIndex < polyline.length - 1; otherIndex += 1) {
        const crossing = getSegmentIntersection(start, end, polyline[otherIndex], polyline[otherIndex + 1]);
        if (!crossing) continue;

        const fromStart = segmentLength * crossing.t;
        const fromEnd = segmentLength * (1 - crossing.t);
        if (fromStart < MIN_ENDPOINT_DISTANCE || fromEnd < MIN_ENDPOINT_DISTANCE) continue;

        if (jumps.some((jump) => jump.segmentIndex === segmentIndex && distance(jump.point, crossing.point) < 4)) {
          continue;
        }

        jumps.push({
          segmentIndex,
          point: crossing.point,
          t: crossing.t,
        });
      }
    }
  }

  return jumps;
}

function getSegmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { point: Point; t: number } | undefined {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross(r, s);

  if (Math.abs(denominator) < EPSILON) return undefined;

  const cMinusA = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(cMinusA, s) / denominator;
  const u = cross(cMinusA, r) / denominator;

  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) {
    return undefined;
  }

  return {
    t,
    point: {
      x: a.x + t * r.x,
      y: a.y + t * r.y,
    },
  };
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function round(value: number): string {
  return Number(value.toFixed(1)).toString();
}
