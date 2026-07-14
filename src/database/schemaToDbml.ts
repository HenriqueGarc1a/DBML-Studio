import type { DatabaseDialect, IntrospectedColumn, IntrospectedDatabaseSchema, IntrospectedTable } from "./types";

export function introspectedSchemaToDbml(schema: IntrospectedDatabaseSchema): string {
  const sections = schema.tables.map((table) => exportTable(table, schema.dialect));
  for (const table of schema.tables) {
    for (const foreignKey of table.foreignKeys) {
      const from = formatEndpoint(tableName(table, schema.dialect), foreignKey.columns);
      const referenced = schema.tables.find((item) => item.schema === foreignKey.referencedSchema && item.name === foreignKey.referencedTable);
      const toName = referenced ? tableName(referenced, schema.dialect) : foreignKey.referencedSchema && foreignKey.referencedSchema !== "public" && foreignKey.referencedSchema !== "main"
        ? `${foreignKey.referencedSchema}.${foreignKey.referencedTable}`
        : foreignKey.referencedTable;
      const settings = [
        normalizeAction("delete", foreignKey.onDelete),
        normalizeAction("update", foreignKey.onUpdate),
      ].filter(Boolean);
      sections.push(`Ref ${formatIdentifier(foreignKey.name)}: ${from} > ${formatEndpoint(toName, foreignKey.referencedColumns)}${settings.length ? ` [${settings.join(", ")}]` : ""}`);
    }
  }
  return `${sections.join("\n\n")}\n`;
}

function exportTable(table: IntrospectedTable, dialect: DatabaseDialect): string {
  const lines = table.columns.map((column) => `  ${exportColumn(column, table.indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0] === column.name))}`);
  const indexes = table.indexes.filter((index) => (index.primary && index.columns.length > 1) || (!index.primary && !(index.unique && index.columns.length === 1)));
  if (indexes.length) {
    lines.push("  indexes {");
    for (const index of indexes) {
      const settings = [index.primary ? "pk" : index.unique ? "unique" : "", index.name ? `name: ${quoteSetting(index.name)}` : "", index.type && index.type !== "btree" ? `type: ${index.type}` : ""].filter(Boolean);
      lines.push(`    (${index.columns.map(formatIdentifier).join(", ")})${settings.length ? ` [${settings.join(", ")}]` : ""}`);
    }
    lines.push("  }");
  }
  return `Table ${formatIdentifier(tableName(table, dialect))} {\n${lines.join("\n")}\n}`;
}

function exportColumn(column: IntrospectedColumn, unique: boolean): string {
  const settings = [
    column.primaryKey ? "pk" : "",
    !column.nullable ? "not null" : "",
    column.autoIncrement ? "increment" : "",
    unique && !column.primaryKey ? "unique" : "",
    column.defaultValue !== undefined ? `default: ${formatDefault(column.defaultValue)}` : "",
  ].filter(Boolean);
  return `${formatIdentifier(column.name)} ${column.type || "text"}${settings.length ? ` [${settings.join(", ")}]` : ""}`;
}

function tableName(table: IntrospectedTable, dialect: DatabaseDialect): string {
  return dialect === "postgres" && table.schema && table.schema !== "public" ? `${table.schema}.${table.name}` : table.name;
}

function formatEndpoint(table: string, columns: string[]): string {
  return columns.length === 1
    ? `${formatIdentifier(table)}.${formatIdentifier(columns[0])}`
    : `${formatIdentifier(table)}.(${columns.map(formatIdentifier).join(", ")})`;
}

function formatIdentifier(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
}

function formatDefault(value: string): string {
  const trimmed = value.trim();
  if (/^(?:-?\d+(?:\.\d+)?|true|false|null)$/i.test(trimmed) || /^'.*'(?:\:\:[A-Za-z0-9_.\[\] ]+)?$/s.test(trimmed)) return trimmed;
  return `\`${trimmed.replace(/`/g, "\\`")}\``;
}

function normalizeAction(name: string, value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized && normalized !== "no action" ? `${name}: ${normalized}` : "";
}

function quoteSetting(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : `'${value.replace(/'/g, "\\'")}'`;
}
