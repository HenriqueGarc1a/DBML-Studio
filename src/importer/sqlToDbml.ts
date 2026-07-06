interface SqlColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
}

interface SqlIndex {
  columns: string[];
  unique?: boolean;
  primary?: boolean;
}

interface SqlForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
}

interface SqlTable {
  name: string;
  columns: SqlColumn[];
  indexes: SqlIndex[];
  foreignKeys: SqlForeignKey[];
}

const CONSTRAINT_KEYWORDS = [
  "constraint",
  "primary key",
  "not null",
  "references",
  "default",
  "unique",
  "check",
  "collate",
  "generated",
  "identity",
  "auto_increment",
  "comment",
  "null",
];

export function sqlToDbml(sql: string): string {
  const statements = splitSqlStatements(stripSqlComments(sql));
  const tables = new Map<string, SqlTable>();

  for (const statement of statements) {
    const table = parseCreateTable(statement);
    if (table) {
      tables.set(normalizeNameKey(table.name), table);
    }
  }

  for (const statement of statements) {
    applyAlterTable(statement, tables);
  }

  if (!tables.size) {
    throw new Error("Nenhum CREATE TABLE encontrado no SQL.");
  }

  const tableBlocks = Array.from(tables.values()).map(formatTable);
  const refs = Array.from(tables.values()).flatMap(formatRefs);

  return [...tableBlocks, ...refs].join("\n\n");
}

function parseCreateTable(statement: string): SqlTable | undefined {
  const match = statement.match(/^\s*create\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?/i);
  if (!match) return undefined;

  const rest = statement.slice(match[0].length).trim();
  const openIndex = rest.indexOf("(");
  if (openIndex < 0) return undefined;

  const closeIndex = findMatchingParen(rest, openIndex);
  if (closeIndex < 0) return undefined;

  const tableName = cleanIdentifierPath(rest.slice(0, openIndex).trim());
  const body = rest.slice(openIndex + 1, closeIndex);
  const table: SqlTable = {
    name: tableName,
    columns: [],
    indexes: [],
    foreignKeys: [],
  };

  for (const definition of splitTopLevel(body, ",")) {
    parseTableDefinition(definition, table);
  }

  applyTableMetadata(table);
  return table;
}

function parseTableDefinition(definition: string, table: SqlTable): void {
  const text = definition.trim().replace(/\s+/g, " ");
  if (!text) return;

  const constraint = text.replace(/^constraint\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)\s+/i, "");
  const primary = constraint.match(/^primary\s+key\s*\(([\s\S]+)\)/i);
  if (primary) {
    table.indexes.push({ columns: parseIdentifierList(primary[1]), primary: true });
    return;
  }

  const unique = constraint.match(/^unique(?:\s+key|\s+index)?(?:\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+))?\s*\(([\s\S]+)\)/i);
  if (unique) {
    table.indexes.push({ columns: parseIdentifierList(unique[2]), unique: true });
    return;
  }

  const foreignKey = constraint.match(/^foreign\s+key\s*\(([\s\S]+?)\)\s+references\s+(.+?)\s*\(([\s\S]+?)\)/i);
  if (foreignKey) {
    table.foreignKeys.push({
      columns: parseIdentifierList(foreignKey[1]),
      refTable: cleanIdentifierPath(foreignKey[2]),
      refColumns: parseIdentifierList(foreignKey[3]),
    });
    return;
  }

  const column = parseColumnDefinition(text);
  if (column) {
    table.columns.push(column.column);
    if (column.references) {
      table.foreignKeys.push({
        columns: [column.column.name],
        refTable: column.references.table,
        refColumns: [column.references.column],
      });
    }
  }
}

function parseColumnDefinition(definition: string): {
  column: SqlColumn;
  references?: { table: string; column: string };
} | undefined {
  const identifier = readIdentifier(definition);
  if (!identifier) return undefined;

  const rest = definition.slice(identifier.end).trim();
  const typeEnd = findFirstKeyword(rest, CONSTRAINT_KEYWORDS);
  const rawType = (typeEnd >= 0 ? rest.slice(0, typeEnd) : rest).trim();
  if (!rawType) return undefined;

  const constraints = typeEnd >= 0 ? rest.slice(typeEnd) : "";
  const references = constraints.match(/\breferences\s+(.+?)\s*\(([\s\S]+?)\)/i);
  const defaultValue = extractDefaultValue(constraints);

  return {
    column: {
      name: cleanIdentifier(identifier.value),
      type: normalizeSqlType(rawType),
      notNull: /\bnot\s+null\b/i.test(constraints),
      primaryKey: /\bprimary\s+key\b/i.test(constraints),
      unique: /\bunique\b/i.test(constraints),
      defaultValue,
    },
    references: references
      ? {
          table: cleanIdentifierPath(references[1]),
          column: parseIdentifierList(references[2])[0] ?? "id",
        }
      : undefined,
  };
}

function applyAlterTable(statement: string, tables: Map<string, SqlTable>): void {
  const match = statement.match(/^\s*alter\s+table\s+(?:only\s+)?(.+?)\s+add\s+(?:constraint\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)\s+)?([\s\S]+)$/i);
  if (!match) return;

  const table = tables.get(normalizeNameKey(cleanIdentifierPath(match[1])));
  if (!table) return;

  parseTableDefinition(match[3], table);
  applyTableMetadata(table);
}

function applyTableMetadata(table: SqlTable): void {
  const columns = new Map(table.columns.map((column) => [normalizeNameKey(column.name), column]));

  for (const index of table.indexes) {
    for (const columnName of index.columns) {
      const column = columns.get(normalizeNameKey(columnName));
      if (!column) continue;
      if (index.primary) column.primaryKey = true;
      if (index.unique && index.columns.length === 1) column.unique = true;
      if (index.primary) column.notNull = true;
    }
  }
}

function formatTable(table: SqlTable): string {
  const lines = [`Table ${formatIdentifier(table.name)} {`];

  for (const column of table.columns) {
    const settings = formatColumnSettings(column);
    lines.push(`  ${formatIdentifier(column.name)} ${column.type}${settings}`);
  }

  const complexIndexes = table.indexes.filter((index) => index.columns.length > 1 || index.primary);
  if (complexIndexes.length) {
    lines.push("");
    lines.push("  indexes {");
    for (const index of complexIndexes) {
      const flags = [index.primary ? "pk" : undefined, index.unique ? "unique" : undefined]
        .filter(Boolean)
        .join(", ");
      const suffix = flags ? ` [${flags}]` : "";
      lines.push(`    (${index.columns.map(formatIdentifier).join(", ")})${suffix}`);
    }
    lines.push("  }");
  }

  lines.push("}");
  return lines.join("\n");
}

function formatColumnSettings(column: SqlColumn): string {
  const settings = [
    column.primaryKey ? "pk" : undefined,
    column.notNull && !column.primaryKey ? "not null" : undefined,
    column.unique ? "unique" : undefined,
    column.defaultValue ? `default: ${column.defaultValue}` : undefined,
  ].filter(Boolean);

  return settings.length ? ` [${settings.join(", ")}]` : "";
}

function formatRefs(table: SqlTable): string[] {
  return table.foreignKeys.flatMap((foreignKey) =>
    foreignKey.columns.map((column, index) => {
      const refColumn = foreignKey.refColumns[index] ?? foreignKey.refColumns[0] ?? "id";
      return `Ref: ${formatIdentifier(table.name)}.${formatIdentifier(column)} < ${formatIdentifier(
        foreignKey.refTable,
      )}.${formatIdentifier(refColumn)}`;
    }),
  );
}

function splitSqlStatements(sql: string): string[] {
  return splitTopLevel(sql, ";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function stripSqlComments(sql: string): string {
  let result = "";
  let quote: string | undefined;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (!quote && char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }

    if (!quote && char === "/" && next === "*") {
      index += 2;
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    if ((char === "'" || char === '"' || char === "`") && sql[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    }

    result += char;
  }

  return result;
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  let bracketQuote = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!quote && !bracketQuote && char === "[") {
      bracketQuote = true;
    } else if (bracketQuote && char === "]") {
      bracketQuote = false;
    } else if (!bracketQuote && (char === "'" || char === '"' || char === "`") && value[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    } else if (!quote && !bracketQuote && char === "(") {
      depth += 1;
    } else if (!quote && !bracketQuote && char === ")") {
      depth -= 1;
    }

    if (!quote && !bracketQuote && depth === 0 && char === separator) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findMatchingParen(value: string, openIndex: number): number {
  let quote: string | undefined;
  let depth = 0;

  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index];

    if ((char === "'" || char === '"' || char === "`") && value[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    } else if (!quote && char === "(") {
      depth += 1;
    } else if (!quote && char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function readIdentifier(value: string): { value: string; end: number } | undefined {
  const trimmedStart = value.search(/\S/);
  if (trimmedStart < 0) return undefined;
  const start = trimmedStart;
  const first = value[start];

  if (first === '"' || first === "`") {
    const end = value.indexOf(first, start + 1);
    return end > start ? { value: value.slice(start, end + 1), end: end + 1 } : undefined;
  }

  if (first === "[") {
    const end = value.indexOf("]", start + 1);
    return end > start ? { value: value.slice(start, end + 1), end: end + 1 } : undefined;
  }

  const match = value.slice(start).match(/^\S+/);
  if (!match) return undefined;
  return { value: match[0], end: start + match[0].length };
}

function findFirstKeyword(value: string, keywords: string[]): number {
  let quote: string | undefined;
  let depth = 0;
  const lower = value.toLowerCase();

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === '"' || char === "`") && value[index - 1] !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
    } else if (!quote && char === "(") {
      depth += 1;
    } else if (!quote && char === ")") {
      depth -= 1;
    }

    if (quote || depth > 0 || (index > 0 && /[a-z0-9_]/i.test(value[index - 1]))) continue;

    for (const keyword of keywords) {
      if (!lower.startsWith(keyword, index)) continue;
      const end = index + keyword.length;
      if (end < value.length && /[a-z0-9_]/i.test(value[end])) continue;
      return index;
    }
  }

  return -1;
}

function extractDefaultValue(constraints: string): string | undefined {
  const match = constraints.match(/\bdefault\s+(.+?)(?=\s+(?:constraint|primary\s+key|not\s+null|null|unique|references|check|collate|generated|identity|comment)\b|$)/i);
  return match?.[1]?.trim();
}

function parseIdentifierList(value: string): string[] {
  return splitTopLevel(value, ",")
    .map(cleanIdentifierPath)
    .filter(Boolean);
}

function cleanIdentifierPath(value: string): string {
  return splitTopLevel(value.trim().replace(/\s+/g, " "), ".")
    .map(cleanIdentifier)
    .join(".");
}

function cleanIdentifier(value: string): string {
  return value.trim().replace(/^["'`\[]+|["'`\]]+$/g, "");
}

function normalizeSqlType(type: string): string {
  const lower = type.trim().replace(/\s+/g, " ").toLowerCase();
  if (/^(bigserial|serial8)\b/.test(lower)) return "bigint";
  if (/^(serial|serial4)\b/.test(lower)) return "int";
  if (/^(smallserial|serial2)\b/.test(lower)) return "smallint";
  if (/^(integer|int4)\b/.test(lower)) return "int";
  if (/^(bigint|int8)\b/.test(lower)) return "bigint";
  if (/^(smallint|int2)\b/.test(lower)) return "smallint";
  if (/^(bool|boolean)\b/.test(lower)) return "boolean";
  if (/^(decimal|numeric)\b/.test(lower)) return lower;
  if (/^(double precision|float8)\b/.test(lower)) return "double";
  if (/^(real|float4)\b/.test(lower)) return "float";
  if (/^(character varying|nvarchar|varchar)\b/.test(lower)) return lower.replace(/^character varying/, "varchar");
  if (/^(character|nchar|char)\b/.test(lower)) return lower.replace(/^character/, "char");
  if (/^(timestamp with time zone|timestamptz)\b/.test(lower)) return "timestamptz";
  if (/^(timestamp without time zone|timestamp)\b/.test(lower)) return "timestamp";
  return lower;
}

function formatIdentifier(value: string): string {
  return value
    .split(".")
    .map((part) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) ? part : `"${part.replace(/"/g, '\\"')}"`))
    .join(".");
}

function normalizeNameKey(value: string): string {
  return cleanIdentifierPath(value).toLowerCase();
}
