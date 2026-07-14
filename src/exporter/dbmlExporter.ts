import type { ColumnModel, DiagramModel, EnumModel, RelationModel, TableCheckModel, TableIndexModel, TableModel } from "../model/types";

export function exportDbml(diagram: DiagramModel): string {
  const sections: string[] = [];
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));

  sections.push(...(diagram.advancedBlocks ?? [])
    .filter((block) => block.kind === "Project" || block.kind === "TablePartial")
    .map((block) => block.raw.trim()));

  for (const table of diagram.tables) {
    sections.push(exportTable(table));
  }

  for (const item of diagram.enums) {
    sections.push(exportEnum(item));
  }

  for (const relation of diagram.relations) {
    sections.push(exportRelation(relation, tableMap));
  }

  sections.push(...(diagram.advancedBlocks ?? [])
    .filter((block) => block.kind === "TableGroup" || block.kind === "Unknown")
    .map((block) => block.raw.trim()));
  sections.push(...(diagram.preservedStatements ?? []).map((statement) => statement.trim()).filter(Boolean));

  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function exportTable(table: TableModel): string {
  const columns = table.columns.map((column) => `  ${exportColumn(column)}`);
  const partials = (table.partials ?? []).map((partial) => `  ~${formatIdentifier(partial)}`);
  const note = table.note ? indentMultiline(`Note: ${formatNote(table.note)}`, "  ") : [];
  const checks = table.checks?.length
    ? ["  checks {", ...table.checks.map((check) => `    ${exportCheck(check)}`), "  }"]
    : [];
  const indexes = table.indexes.length
    ? [
        "  indexes {",
        ...table.indexes.map((index) => `    ${exportIndex(index)}`),
        "  }",
      ]
    : [];

  const alias = table.alias ? ` as ${formatIdentifier(table.alias)}` : "";
  const headerSettings = table.headerSettings?.length ? ` [${table.headerSettings.join(", ")}]` : "";

  return `Table ${formatIdentifier(table.name)}${alias}${headerSettings} {\n${[
    ...columns,
    ...partials,
    ...note,
    ...checks,
    ...indexes,
    ...(table.preservedBlocks ?? []).flatMap((block) => indentMultiline(block, "  ")),
  ].join("\n")}\n}`;
}

function exportCheck(check: TableCheckModel): string {
  const settings = new Set((check.settings ?? []).filter((setting) => !setting.toLowerCase().startsWith("name:")));
  if (check.name) settings.add(`name: ${quoteSetting(check.name)}`);
  const suffix = settings.size ? ` [${Array.from(settings).join(", ")}]` : "";
  return `\`${check.expression.replace(/`/g, "\\`")}\`${suffix}`;
}

function exportIndex(index: TableIndexModel): string {
  const settings = new Set((index.settings ?? []).filter((setting) => {
    const lower = setting.toLowerCase();
    return lower !== "unique" && lower !== "pk" && lower !== "primary key" &&
      !lower.startsWith("name:") && !lower.startsWith("type:");
  }));
  if (index.unique) settings.add("unique");
  if (index.primary) settings.add("pk");
  if (index.name) settings.add(`name: ${quoteSetting(index.name)}`);
  if (index.type) settings.add(`type: ${index.type}`);
  const suffix = settings.size ? ` [${Array.from(settings).join(", ")}]` : "";
  return `(${index.columns.map(formatIndexExpression).join(", ")})${suffix}`;
}

function exportColumn(column: ColumnModel): string {
  const settings = new Set<string>();

  if (!column.nullable) settings.add("not null");
  if (column.primaryKey) settings.add("pk");
  if (column.unique) settings.add("unique");
  if (column.defaultValue) settings.add(`default: ${column.defaultValue}`);
  if (column.note) settings.add(`note: ${formatNote(column.note)}`);

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
  const from = formatEndpoint(fromTable, relation.fromColumns ?? [relation.fromColumn]);
  const to = formatEndpoint(toTable, relation.toColumns ?? [relation.toColumn]);
  const operator = relation.dbmlOperator ?? ">";
  const left = operator === "<" ? to : from;
  const right = operator === "<" ? from : to;
  const settings = relation.dbmlSettings?.length ? ` [${relation.dbmlSettings.join(", ")}]` : "";
  const name = relation.dbmlName ? ` ${formatIdentifier(relation.dbmlName)}` : "";
  return `Ref${name}: ${left} ${operator} ${right}${settings}`;
}

function exportEnum(item: EnumModel): string {
  const values = item.values.map((value) => {
    const settings = item.valueSettings?.[value];
    return `  ${formatIdentifier(value)}${settings?.length ? ` [${settings.join(", ")}]` : ""}`;
  });
  const note = item.note ? indentMultiline(`Note: ${formatNote(item.note)}`, "  ") : [];
  return `Enum ${formatIdentifier(item.name)} {\n${[...values, ...note].join("\n")}\n}`;
}

function formatEndpoint(table: string, columns: string[]): string {
  if (columns.length === 1) return `${formatIdentifier(table)}.${formatIdentifier(columns[0])}`;
  return `${formatIdentifier(table)}.(${columns.map(formatIdentifier).join(", ")})`;
}

function formatIndexExpression(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("`") && trimmed.endsWith("`") ? trimmed : formatIdentifier(trimmed);
}

function formatIdentifier(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, "\\'");
}

function formatNote(value: string): string {
  if (value.includes("\n")) {
    const marker = value.includes("'''") ? '\"\"\"' : "'''";
    return `${marker}\n${value}\n${marker}`;
  }
  return `'${escapeSingle(value)}'`;
}

function indentMultiline(value: string, indent: string): string[] {
  return value.split("\n").map((line) => `${indent}${line}`);
}

function quoteSetting(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : `'${escapeSingle(value)}'`;
}
