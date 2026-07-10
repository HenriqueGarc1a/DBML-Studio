import type { ColumnModel, TableModel } from "./types";

export function getVisualColumns(table: TableModel): ColumnModel[] {
  const order = new Map((table.columnOrder ?? []).map((name, index) => [name, index]));
  return [...table.columns].sort((a, b) => {
    if (a.primaryKey !== b.primaryKey) return a.primaryKey ? -1 : 1;
    const aOrder = order.get(a.name);
    const bOrder = order.get(b.name);
    if (aOrder !== undefined || bOrder !== undefined) {
      return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return table.columns.indexOf(a) - table.columns.indexOf(b);
  });
}
