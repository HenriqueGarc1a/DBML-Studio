import type { GroupModel, RelationModel, TableModel, TableVisual } from "./types";

export function getGroupForTable(table: TableModel, groups: GroupModel[]): GroupModel | undefined {
  if (!table.usesGroupStyle) return undefined;

  const center = {
    x: table.x + table.width / 2,
    y: table.y + table.height / 2,
  };

  return [...groups].reverse().find((group) =>
    center.x >= group.x &&
    center.x <= group.x + group.width &&
    center.y >= group.y &&
    center.y <= group.y + group.height,
  );
}

export function getTableGroupVisual(table: TableModel, groups: GroupModel[]): TableVisual | undefined {
  return getGroupForTable(table, groups)?.tableVisual;
}

export function getEffectiveTableVisual(
  table: TableModel,
  defaultVisual: TableVisual,
  groups: GroupModel[] = [],
): TableVisual {
  return getTableGroupVisual(table, groups) ?? (table.usesDefaultStyle ? defaultVisual : table.visual);
}

export function getRelationColor(
  relation: RelationModel,
  tables: TableModel[],
  defaultVisual: TableVisual,
  groups: GroupModel[] = [],
): string {
  if (!relation.usesTableLineColor) return relation.color;

  const fromTable = tables.find((table) => table.id === relation.fromTable);
  return fromTable ? getEffectiveTableVisual(fromTable, defaultVisual, groups).lineColor : relation.color;
}

export function getRelationFlowColor(
  relation: RelationModel,
  tables: TableModel[],
  defaultVisual: TableVisual,
  groups: GroupModel[] = [],
  direction: "forward" | "reverse" = "forward",
): string {
  const tableId = direction === "reverse" ? relation.toTable : relation.fromTable;
  const table = tables.find((item) => item.id === tableId);
  return table ? getEffectiveTableVisual(table, defaultVisual, groups).headerColor : getRelationColor(
    relation,
    tables,
    defaultVisual,
    groups,
  );
}
