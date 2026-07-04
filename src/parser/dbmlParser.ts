import {
  TABLE_MIN_WIDTH,
  TABLE_PADDING_X,
  defaultDiagramVisual,
  defaultRelationVisual,
  defaultTableVisual,
  getTableMinHeight,
} from "../model/defaults";
import type {
  Cardinality,
  ColumnModel,
  DiagramModel,
  EnumModel,
  RelationModel,
  TableIndexModel,
  TableModel,
} from "../model/types";
import { makeId, slugify } from "../utils/id";
import { parseSpecialComments } from "./specialComments";

interface Block {
  name: string;
  lines: string[];
}

interface ParsedEndpoint {
  table: string;
  column: string;
}

interface ParsedRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  fromCardinality?: Cardinality;
  toCardinality?: Cardinality;
}

export function parseDbml(source: string): DiagramModel {
  validateDbmlSyntax(source);

  const special = parseSpecialComments(source);
  const tables = parseTables(source, special.tableProps);
  const enums = parseEnums(source);
  const parsedRelations = dedupeRelations([
    ...parseRefLines(source),
    ...parseInlineColumnRefs(tables),
  ]);
  const relations = parsedRelations.map((relation, index) => ({
    id: makeId(
      "relation",
      `${relation.fromTable}-${relation.fromColumn}-${relation.toTable}-${relation.toColumn}`,
      index,
    ),
    ...defaultRelationVisual,
    ...relation,
    fromTable: slugify(relation.fromTable),
    toTable: slugify(relation.toTable),
    ...(special.lineProps[index] ?? {}),
  }));
  const foreignKeys = new Set(relations.map((relation) => `${relation.fromTable}.${relation.fromColumn}`));
  const tablesWithForeignKeys = tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) =>
      foreignKeys.has(`${table.id}.${column.name}`) ? { ...column, foreignKey: true } : column,
    ),
  }));

  return {
    id: "diagram-main",
    visual: { ...defaultDiagramVisual, ...(special.diagramProps.visual ?? {}) },
    tables: tablesWithForeignKeys,
    relations,
    groups: special.groups,
    enums,
    source,
  };
}

function parseTables(source: string, tableProps: Map<string, Partial<TableModel>>): TableModel[] {
  return scanBlocks(source, "Table").map((block, index) => {
    const tableName = cleanIdentifier(block.name);
    const parsed = parseTableBody(tableName, block.lines);
    const special = tableProps.get(tableName) || tableProps.get(slugify(tableName));
    const measuredWidth = measureWidth(tableName, parsed.columns);
    const measuredHeight = getTableMinHeight(parsed.columns.length);
    const visual = { ...defaultTableVisual, ...(special?.visual ?? {}) };

    return {
      id: slugify(tableName),
      name: tableName,
      columns: parsed.columns,
      x: special?.x ?? index * 300,
      y: special?.y ?? index * 120,
      width: special?.width || measuredWidth,
      height: Math.max(special?.height ?? measuredHeight, measuredHeight),
      visual,
      indexes: parsed.indexes,
      note: parsed.note,
      layoutSource: special?.layoutSource ?? "auto",
    };
  });
}

function parseTableBody(
  tableName: string,
  lines: string[],
): { columns: ColumnModel[]; indexes: TableIndexModel[]; note?: string } {
  const columns: ColumnModel[] = [];
  const indexes: TableIndexModel[] = [];
  let note: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed === "}") continue;

    if (/^indexes\s*\{/i.test(trimmed)) {
      const indexLines: string[] = [];
      let depth = count(trimmed, "{") - count(trimmed, "}");

      while (index + 1 < lines.length && depth > 0) {
        index += 1;
        const line = lines[index].trim();
        depth += count(line, "{") - count(line, "}");
        if (depth >= 1 && line !== "}") {
          indexLines.push(line);
        }
      }

      indexes.push(...parseIndexes(indexLines));
      continue;
    }

    if (/^note\s*:/i.test(trimmed)) {
      note = cleanNote(trimmed.replace(/^note\s*:/i, ""));
      continue;
    }

    const column = parseColumn(tableName, trimmed, columns.length);
    if (column) {
      columns.push(column);
    }
  }

  return { columns, indexes, note };
}

function parseColumn(tableName: string, line: string, index: number): ColumnModel | undefined {
  const cleanLine = stripInlineComment(line).trim();
  if (!cleanLine || cleanLine.includes("{") || cleanLine === "}") return undefined;

  const match = cleanLine.match(/^("[^"]+"|`[^`]+`|[^\s]+)\s+(.+)$/);
  if (!match) return undefined;

  const name = cleanIdentifier(match[1]);
  const rest = match[2].trim();
  const settingsMatch = rest.match(/\[([\s\S]+)\]\s*$/);
  const settings = settingsMatch ? splitSettings(settingsMatch[1]) : [];
  const type = (settingsMatch ? rest.slice(0, settingsMatch.index).trim() : rest).trim();
  const settingsText = settings.map((item) => item.toLowerCase());

  return {
    id: makeId("column", `${tableName}-${name}`, index),
    name,
    type,
    nullable: !settingsText.some((item) => item === "not null" || item === "not_null"),
    primaryKey: settingsText.some((item) => item === "pk" || item === "primary key"),
    foreignKey: settingsText.some((item) => item.startsWith("ref:") || item === "fk" || item === "foreign key"),
    unique: settingsText.includes("unique"),
    defaultValue: extractSetting(settings, "default"),
    note: extractSetting(settings, "note"),
    rawSettings: settings,
  };
}

function parseIndexes(lines: string[]): TableIndexModel[] {
  return lines
    .map((line) => stripInlineComment(line).trim())
    .filter(Boolean)
    .map((line) => {
      const settingsMatch = line.match(/\[([\s\S]+)\]\s*$/);
      const rawColumns = (settingsMatch ? line.slice(0, settingsMatch.index).trim() : line).trim();
      const settings = settingsMatch ? splitSettings(settingsMatch[1]).map((item) => item.toLowerCase()) : [];
      const columns = rawColumns
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .map((column) => cleanIdentifier(column.trim()))
        .filter(Boolean);

      return {
        columns,
        unique: settings.includes("unique"),
        primary: settings.includes("pk") || settings.includes("primary key"),
        raw: line,
      };
    });
}

function parseEnums(source: string): EnumModel[] {
  return scanBlocks(source, "Enum").map((block, index) => ({
    id: makeId("enum", block.name, index),
    name: cleanIdentifier(block.name),
    values: block.lines
      .map((line) => stripInlineComment(line).trim())
      .filter((line) => line && line !== "}")
      .map(cleanIdentifier),
  }));
}

function parseRefLines(source: string): ParsedRelation[] {
  const relations: ParsedRelation[] = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const cleanLine = stripInlineComment(line).trim();
    if (!/^ref\b/i.test(cleanLine)) continue;

    const colon = cleanLine.match(/^ref\s*:\s*(.+)$/i);
    if (colon) {
      const parsed = parseRelationExpression(colon[1]);
      if (parsed) relations.push(parsed);
    }
  }

  for (const block of scanBlocks(source, "Ref")) {
    for (const line of block.lines) {
      const parsed = parseRelationExpression(stripInlineComment(line).trim());
      if (parsed) relations.push(parsed);
    }
  }

  return relations;
}

function parseInlineColumnRefs(tables: TableModel[]): ParsedRelation[] {
  const relations: ParsedRelation[] = [];

  for (const table of tables) {
    for (const column of table.columns) {
      const ref = column.rawSettings.find((setting) => setting.toLowerCase().startsWith("ref:"));
      if (!ref) continue;

      const expression = ref.replace(/^ref\s*:\s*/i, `${table.name}.${column.name} `);
      const parsed = parseRelationExpression(expression);
      if (parsed) {
        relations.push(parsed);
      }
    }
  }

  return relations;
}

function parseRelationExpression(expression: string): ParsedRelation | undefined {
  const match = expression.match(/(.+?)\s*([<>-])\s*(.+)/);
  if (!match) return undefined;

  const left = parseEndpoint(match[1]);
  const right = parseEndpoint(match[3]);
  if (!left || !right) return undefined;

  if (match[2] === "<") {
    return {
      fromTable: right.table,
      fromColumn: right.column,
      toTable: left.table,
      toColumn: left.column,
      fromCardinality: "many",
      toCardinality: "one",
    };
  }

  return {
    fromTable: left.table,
    fromColumn: left.column,
    toTable: right.table,
    toColumn: right.column,
    fromCardinality: match[2] === "-" ? "one" : "many",
    toCardinality: "one",
  };
}

function parseEndpoint(value: string): ParsedEndpoint | undefined {
  const clean = value.trim().replace(/[{}]/g, "");
  const parts = clean.split(".");
  if (parts.length < 2) return undefined;

  const column = cleanIdentifier(parts.pop() || "");
  const table = cleanIdentifier(parts.join("."));
  if (!table || !column) return undefined;

  return { table, column };
}

function dedupeRelations(relations: ParsedRelation[]): ParsedRelation[] {
  const seen = new Set<string>();
  const next: ParsedRelation[] = [];

  for (const relation of relations) {
    const key = `${relation.fromTable}.${relation.fromColumn}>${relation.toTable}.${relation.toColumn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(relation);
  }

  return next;
}

function scanBlocks(source: string, keyword: "Table" | "Enum" | "Ref"): Block[] {
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  const startPattern = new RegExp(`^\\s*${keyword}\\b\\s*([^\\{]*)`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(startPattern);
    if (!match || /^ref\s*:/i.test(line.trim())) continue;

    let depth = count(line, "{") - count(line, "}");
    if (depth <= 0) continue;

    const name = cleanBlockName(match[1]);
    const blockLines: string[] = [];

    while (index + 1 < lines.length && depth > 0) {
      index += 1;
      const blockLine = lines[index];
      depth += count(blockLine, "{") - count(blockLine, "}");
      if (depth > 0) blockLines.push(blockLine);
    }

    blocks.push({ name, lines: blockLines });
  }

  return blocks;
}

function cleanBlockName(value: string): string {
  return value
    .replace(/\bas\b.+$/i, "")
    .replace(/\{.*$/, "")
    .trim();
}

function stripInlineComment(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function cleanIdentifier(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, "");
}

function cleanNote(value: string): string {
  return cleanIdentifier(value.trim());
}

function splitSettings(value: string): string[] {
  const settings: string[] = [];
  let current = "";
  let quote: string | undefined;
  let depth = 0;

  for (const char of value) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
    } else if (quote === char) {
      quote = undefined;
    } else if (!quote && char === "(") {
      depth += 1;
    } else if (!quote && char === ")") {
      depth -= 1;
    }

    if (char === "," && !quote && depth === 0) {
      settings.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) settings.push(current.trim());
  return settings;
}

function extractSetting(settings: string[], key: string): string | undefined {
  const found = settings.find((setting) => setting.toLowerCase().startsWith(`${key}:`));
  return found ? cleanIdentifier(found.slice(found.indexOf(":") + 1).trim()) : undefined;
}

function measureWidth(tableName: string, columns: ColumnModel[]): number {
  const longestColumn = columns.reduce((max, column) => {
    return Math.max(max, `${column.name} ${column.type}`.length);
  }, tableName.length);

  return Math.max(TABLE_MIN_WIDTH, longestColumn * 8 + TABLE_PADDING_X * 2 + 70);
}

function count(value: string, char: string): number {
  return value.split(char).length - 1;
}

function validateDbmlSyntax(source: string): void {
  const stack: Array<{ char: string; line: number; column: number }> = [];
  const matching: Record<string, string> = {
    "}": "{",
    "]": "[",
    ")": "(",
  };

  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    let quote: string | undefined;
    let escaped = false;

    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const char = line[columnIndex];
      const next = line[columnIndex + 1];

      if (!quote && char === "/" && next === "/") break;

      if (quote) {
        if (char === "\\" && !escaped) {
          escaped = true;
          continue;
        }

        if (char === quote && !escaped) {
          quote = undefined;
        }

        escaped = false;
        continue;
      }

      if (char === "'" || char === "\"" || char === "`") {
        quote = char;
        continue;
      }

      if (char === "{" || char === "[" || char === "(") {
        stack.push({ char, line: lineIndex + 1, column: columnIndex + 1 });
        continue;
      }

      if (char === "}" || char === "]" || char === ")") {
        const open = stack.pop();
        if (!open || open.char !== matching[char]) {
          throw new Error(`Linha ${lineIndex + 1}: fechamento "${char}" sem abertura correspondente.`);
        }
      }
    }

    if (quote) {
      throw new Error(`Linha ${lineIndex + 1}: texto "${quote}" nao foi fechado.`);
    }
  }

  const open = stack.pop();
  if (open) {
    throw new Error(`Linha ${open.line}: abertura "${open.char}" nao foi fechada.`);
  }
}
