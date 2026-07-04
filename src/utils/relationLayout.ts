import type { Direction, RelationModel, TableModel } from "../model/types";

interface EndpointRef {
  relation: RelationModel;
  endpoint: "start" | "end";
  side: Direction;
  offsetX: number;
  offsetY: number;
}

const ENDPOINT_SPACING = 14;

export function distributeRelationEndpoints(
  relations: RelationModel[],
  tables: Map<string, TableModel>,
): Map<string, RelationModel> {
  const adjusted = new Map(relations.map((relation) => [relation.id, { ...relation }]));
  const groups = new Map<string, EndpointRef[]>();

  for (const relation of relations) {
    const fromTable = tables.get(relation.fromTable);
    const toTable = tables.get(relation.toTable);

    if (fromTable && isAutoEndpoint(relation.startOffsetX, relation.startOffsetY)) {
      addEndpoint(groups, fromTable, relation.fromColumn, {
        relation,
        endpoint: "start",
        side: relation.fromSide,
        offsetX: relation.startOffsetX,
        offsetY: relation.startOffsetY,
      });
    }

    if (toTable && isAutoEndpoint(relation.endOffsetX, relation.endOffsetY)) {
      addEndpoint(groups, toTable, relation.toColumn, {
        relation,
        endpoint: "end",
        side: relation.toSide,
        offsetX: relation.endOffsetX,
        offsetY: relation.endOffsetY,
      });
    }
  }

  for (const endpoints of groups.values()) {
    if (endpoints.length < 2) continue;

    endpoints.forEach((endpoint, index) => {
      const relation = adjusted.get(endpoint.relation.id);
      if (!relation) return;

      const offset = (index - (endpoints.length - 1) / 2) * ENDPOINT_SPACING;
      const patch = endpoint.side === "north" || endpoint.side === "south"
        ? { x: offset, y: 0 }
        : { x: 0, y: offset };

      if (endpoint.endpoint === "start") {
        relation.startOffsetX = endpoint.offsetX + patch.x;
        relation.startOffsetY = endpoint.offsetY + patch.y;
      } else {
        relation.endOffsetX = endpoint.offsetX + patch.x;
        relation.endOffsetY = endpoint.offsetY + patch.y;
      }
    });
  }

  return adjusted;
}

function addEndpoint(
  groups: Map<string, EndpointRef[]>,
  table: TableModel,
  column: string,
  endpoint: EndpointRef,
): void {
  const key = endpoint.side === "north" || endpoint.side === "south"
    ? `${table.id}:${endpoint.side}`
    : `${table.id}:${endpoint.side}:${column}`;
  const group = groups.get(key) ?? [];

  group.push(endpoint);
  groups.set(key, group);
}

function isAutoEndpoint(offsetX: number, offsetY: number): boolean {
  return Math.abs(offsetX) < 0.01 && Math.abs(offsetY) < 0.01;
}
