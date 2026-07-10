import type { ColumnModel, DiagramModel, RelationModel, TableModel } from "../model/types";

export function exportDbml(diagram: DiagramModel): string {
  const sections: string[] = [];
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));

  for (const table of diagram.tables) {
    sections.push(exportTable(table));
  }

  for (const item of diagram.enums) {
    sections.push(`Enum ${formatIdentifier(item.name)} {\n${item.values.map((value) => `  ${formatIdentifier(value)}`).join("\n")}\n}`);
  }

  for (const relation of diagram.relations) {
    sections.push(exportRelation(relation, tableMap));
  }

  return `${sections.join("\n\n")}\n`;
}

function exportTable(table: TableModel): string {
  const columns = table.columns.map((column) => `  ${exportColumn(column)}`);
  const note = table.note ? [`  Note: '${escapeSingle(table.note)}'`] : [];
  const indexes = table.indexes.length
    ? [
        "  indexes {",
        ...table.indexes.map((index) => {
          const settings = [
            index.unique ? "unique" : "",
            index.primary ? "pk" : "",
          ].filter(Boolean);
          const suffix = settings.length ? ` [${settings.join(", ")}]` : "";
          return `    (${index.columns.map(formatIdentifier).join(", ")})${suffix}`;
        }),
        "  }",
      ]
    : [];

  return `Table ${formatIdentifier(table.name)} {\n${[
    ...columns,
    ...note,
    ...indexes,
  ].join("\n")}\n}`;
}

function exportColumn(column: ColumnModel): string {
  const settings = new Set<string>();

  if (!column.nullable) settings.add("not null");
  if (column.primaryKey) settings.add("pk");
  if (column.unique) settings.add("unique");
  if (column.defaultValue) settings.add(`default: ${column.defaultValue}`);
  if (column.note) settings.add(`note: '${escapeSingle(column.note)}'`);

  for (const setting of column.rawSettings) {
    const lower = setting.toLowerCase();
    const isManaged =
      lower.startsWith("ref:") ||
      lower === "not null" ||
      lower === "not_null" ||
      lower === "pk" ||
      lower === "primary key" ||
      lower === "unique" ||
      lower.startsWith("default:") ||
      lower.startsWith("note:");

    if (!isManaged) {
      settings.add(setting);
    }
  }

  const suffix = settings.size ? ` [${Array.from(settings).join(", ")}]` : "";
  return `${formatIdentifier(column.name)} ${column.type}${suffix}`;
}

function exportRelation(relation: RelationModel, tableMap: Map<string, TableModel>): string {
  const fromTable = tableMap.get(relation.fromTable)?.name ?? relation.fromTable;
  const toTable = tableMap.get(relation.toTable)?.name ?? relation.toTable;
  return `Ref: ${formatIdentifier(fromTable)}.${formatIdentifier(
    relation.fromColumn,
  )} > ${formatIdentifier(toTable)}.${formatIdentifier(relation.toColumn)}`;
}

function formatIdentifier(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, "\\'");
}
