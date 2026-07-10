import type { DiagramModel, Point, TableModel } from "../model/types";
import { getRelationGeometry } from "../utils/geometry";
import { organizeRelationRoute } from "../utils/relationRouting";
import { layoutDiagram, type LayoutOptions } from "./autoLayout";

export async function layoutDiagramForMinimumCrossings(diagram: DiagramModel): Promise<DiagramModel> {
  if (diagram.tables.length < 2) return diagram;
  const orders = candidateOrders(diagram);
  const variants: LayoutOptions[] = [];
  for (const direction of ["RIGHT", "DOWN"] as const) {
    for (const nodePlacement of ["NETWORK_SIMPLEX", "BRANDES_KOEPF"] as const) {
      for (const tableOrder of orders) variants.push({ preserveManual: false, direction, nodePlacement, tableOrder });
    }
  }

  const generated = await Promise.all(variants.map(async (options) => {
    const positioned = await layoutDiagram(diagram, options);
    return routeAllRelations(reframeGroups(optimizeVisualColumnOrder(positioned)));
  }));
  const candidates = [routeAllRelations(diagram), ...generated];
  return candidates.reduce((best, candidate) =>
    layoutScore(candidate) < layoutScore(best) ? candidate : best);
}

export function optimizeVisualColumnOrder(diagram: DiagramModel): DiagramModel {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  const neighborPositions = new Map<string, number[]>();
  for (const relation of diagram.relations) {
    const from = tableMap.get(relation.fromTable);
    const to = tableMap.get(relation.toTable);
    if (!from || !to) continue;
    addNeighbor(neighborPositions, `${from.id}.${relation.fromColumn}`, to.y + to.height / 2);
    addNeighbor(neighborPositions, `${to.id}.${relation.toColumn}`, from.y + from.height / 2);
  }

  return {
    ...diagram,
    tables: diagram.tables.map((table) => {
      const originalIndex = new Map(table.columns.map((column, index) => [column.name, index]));
      const names = [...table.columns].sort((a, b) => {
        if (a.primaryKey !== b.primaryKey) return a.primaryKey ? -1 : 1;
        const aScore = average(neighborPositions.get(`${table.id}.${a.name}`));
        const bScore = average(neighborPositions.get(`${table.id}.${b.name}`));
        if (aScore !== bScore) return aScore - bScore;
        return (originalIndex.get(a.name) ?? 0) - (originalIndex.get(b.name) ?? 0);
      }).map((column) => column.name);
      return { ...table, columnOrder: names };
    }),
  };
}

function addNeighbor(map: Map<string, number[]>, key: string, value: number): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function average(values?: number[]): number {
  if (!values?.length) return Number.MAX_SAFE_INTEGER;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function reframeGroups(diagram: DiagramModel): DiagramModel {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  return {
    ...diagram,
    groups: diagram.groups.map((group) => {
      const members = group.tables.flatMap((id) => {
        const table = tableMap.get(id);
        return table ? [table] : [];
      });
      if (!members.length) return group;
      const padding = 40;
      const left = Math.min(...members.map((table) => table.x));
      const top = Math.min(...members.map((table) => table.y));
      const right = Math.max(...members.map((table) => table.x + table.width));
      const bottom = Math.max(...members.map((table) => table.y + table.height));
      return { ...group, x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
    }),
  };
}

export function countRelationCrossings(diagram: DiagramModel): number {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  const paths = diagram.relations.flatMap((relation) => {
    const from = tableMap.get(relation.fromTable);
    const to = tableMap.get(relation.toTable);
    return from && to ? [getRelationGeometry(relation, from, to).points] : [];
  });
  let crossings = 0;
  for (let first = 0; first < paths.length; first += 1) {
    for (let second = first + 1; second < paths.length; second += 1) {
      crossings += polylineCrossings(paths[first], paths[second]);
    }
  }
  return crossings;
}

function routeAllRelations(diagram: DiagramModel): DiagramModel {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  return {
    ...diagram,
    relations: diagram.relations.map((relation) => {
      const from = tableMap.get(relation.fromTable);
      const to = tableMap.get(relation.toTable);
      if (!from || !to) return relation;
      const route = organizeRelationRoute(
        relation, from, to, diagram.tables, relation.fromSide, relation.toSide, diagram.visual.tableRouteMargin,
      );
      return { ...relation, ...route, route: "orthogonal" as const };
    }),
  };
}

function candidateOrders(diagram: DiagramModel): string[][] {
  const degree = new Map(diagram.tables.map((table) => [table.id, 0]));
  for (const relation of diagram.relations) {
    degree.set(relation.fromTable, (degree.get(relation.fromTable) ?? 0) + 1);
    degree.set(relation.toTable, (degree.get(relation.toTable) ?? 0) + 1);
  }
  const original = diagram.tables.map((table) => table.id);
  const highDegree = [...original].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
  return [original, [...original].reverse(), highDegree, [...highDegree].reverse()];
}

function layoutScore(diagram: DiagramModel): number {
  const crossings = countRelationCrossings(diagram);
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  let length = 0;
  let bends = 0;
  for (const relation of diagram.relations) {
    const from = tableMap.get(relation.fromTable);
    const to = tableMap.get(relation.toTable);
    if (!from || !to) continue;
    const points = getRelationGeometry(relation, from, to).points;
    bends += Math.max(0, points.length - 2);
    length += points.slice(1).reduce((sum, point, index) => sum + manhattan(points[index], point), 0);
  }
  const area = layoutArea(diagram.tables);
  return crossings * 1_000_000_000 + length + bends * 80 + area * 0.0005;
}

function polylineCrossings(a: Point[], b: Point[]): number {
  let count = 0;
  for (let ai = 0; ai < a.length - 1; ai += 1) {
    for (let bi = 0; bi < b.length - 1; bi += 1) {
      if (properIntersection(a[ai], a[ai + 1], b[bi], b[bi + 1])) count += 1;
    }
  }
  return count;
}

function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const aVertical = a.x === b.x;
  const cVertical = c.x === d.x;
  if (aVertical === cVertical) return false;
  const verticalA = aVertical ? a : c;
  const verticalB = aVertical ? b : d;
  const horizontalA = aVertical ? c : a;
  const horizontalB = aVertical ? d : b;
  return verticalA.x > Math.min(horizontalA.x, horizontalB.x) &&
    verticalA.x < Math.max(horizontalA.x, horizontalB.x) &&
    horizontalA.y > Math.min(verticalA.y, verticalB.y) &&
    horizontalA.y < Math.max(verticalA.y, verticalB.y);
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function layoutArea(tables: TableModel[]): number {
  if (!tables.length) return 0;
  const left = Math.min(...tables.map((table) => table.x));
  const top = Math.min(...tables.map((table) => table.y));
  const right = Math.max(...tables.map((table) => table.x + table.width));
  const bottom = Math.max(...tables.map((table) => table.y + table.height));
  return (right - left) * (bottom - top);
}
