import {
  defaultBadgeVisuals,
  TABLE_MIN_WIDTH,
  TABLE_PADDING_X,
  defaultDiagramVisual,
  defaultRelationVisual,
  defaultTableVisual,
  getTableMinHeight,
  normalizeGridSize,
  normalizeRouteMargin,
} from "../model/defaults";
import type {
  Cardinality,
  ColumnModel,
  DbmlAdvancedBlock,
  DiagramModel,
  EnumModel,
  RelationModel,
  TableCheckModel,
  TableIndexModel,
  TableModel,
} from "../model/types";
import { makeId, slugify } from "../utils/id";
import { parseSpecialComments, type LineSpecialProps } from "./specialComments";

interface Block {
  name: string;
  header: string;
  lines: string[];
  raw: string;
}

interface ParsedEndpoint {
  table: string;
  column: string;
  columns: string[];
}

interface ParsedRelation {
  fromTable: string;
  fromColumn: string;
  fromColumns?: string[];
  toTable: string;
  toColumn: string;
  toColumns?: string[];
  fromCardinality?: Cardinality;
  toCardinality?: Cardinality;
  dbmlName?: string;
  dbmlOperator?: RelationModel["dbmlOperator"];
  dbmlSettings?: string[];
}

export function parseDbml(source: string): DiagramModel {
  validateDbmlSyntax(source);

  const special = parseSpecialComments(source);
  const visual = createDiagramVisual(special.diagramProps.visual);
  const tables = parseTables(source, special.tableProps, visual.defaultTable);
  const enums = parseEnums(source);
  const parsedRelations = dedupeRelations([
    ...parseRefLines(source),
    ...parseInlineColumnRefs(tables),
  ]);
  const lineLookup = createLineSpecialLookup(special.lineProps);
  const relations = parsedRelations.map((relation, index) => {
    const relationIdBase = makeId(
      "relation",
      `${relation.fromTable}-${relation.fromColumn}-${relation.toTable}-${relation.toColumn}`,
    );
    const relationId = makeId(
      "relation",
      `${relation.fromTable}-${relation.fromColumn}-${relation.toTable}-${relation.toColumn}`,
      index,
    );
    const lineProps = getLineSpecialProps(lineLookup, {
      id: relationId,
      baseId: relationIdBase,
      signature: relationSignature(relation),
      index,
    });

    return {
      id: relationId,
      ...defaultRelationVisual,
      ...relation,
      fromTable: slugify(relation.fromTable),
      toTable: slugify(relation.toTable),
      ...(lineProps ?? {}),
    };
  });
  const foreignKeys = new Set(
    relations.flatMap((relation) =>
      (relation.fromColumns ?? [relation.fromColumn]).map((column) => `${relation.fromTable}.${column}`),
    ),
  );

  const tablesWithForeignKeys = tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) =>
      foreignKeys.has(`${table.id}.${column.name}`)
        ? { ...column, foreignKey: true }
        : column,
    ),
  }));
  const compatibility = extractCompatibilityMetadata(source);
  if (relations.some((relation) => (relation.fromColumns?.length ?? 1) > 1 || (relation.toColumns?.length ?? 1) > 1)) {
    compatibility.warnings.push("Relações compostas são preservadas integralmente; no canvas, a linha é ancorada no primeiro campo de cada lado.");
  }
  for (const table of tablesWithForeignKeys.filter((item) => item.preservedBlocks?.length)) {
    const names = Array.from(new Set(table.preservedBlocks?.map((block) => block.match(/^([A-Za-z][A-Za-z0-9_]*)/)?.[1]).filter(Boolean)));
    compatibility.warnings.push(`A tabela "${table.name}" contém ${names.join(", ") || "blocos internos"} em modo somente leitura; o conteúdo será preservado na exportação.`);
  }

  return {
    id: "diagram-main",
    visual,
    tables: tablesWithForeignKeys,
    relations,
    groups: special.groups,
    enums,
    advancedBlocks: compatibility.advancedBlocks,
    preservedStatements: compatibility.preservedStatements,
    dbmlWarnings: Array.from(new Set(compatibility.warnings)),
    source,
  };
}

interface LineSpecialLookup {
  byKey: Map<string, Partial<RelationModel>>;
  byBaseKey: Map<string, Partial<RelationModel>>;
  bySignature: Map<string, Partial<RelationModel>>;
  unkeyedByIndex: Array<Partial<RelationModel> | undefined>;
}

function createLineSpecialLookup(lineProps: LineSpecialProps[]): LineSpecialLookup {
  const lookup: LineSpecialLookup = {
    byKey: new Map(),
    byBaseKey: new Map(),
    bySignature: new Map(),
    unkeyedByIndex: [],
  };

  lineProps.forEach((item, index) => {
    const key = item.key.trim();
    if (!key) {
      lookup.unkeyedByIndex[index] = item.props;
      return;
    }

    lookup.byKey.set(key, item.props);

    const baseKey = stripGeneratedRelationIndex(key);
    if (baseKey !== key) {
      lookup.byBaseKey.set(baseKey, item.props);
    }

    const signature = normalizeRelationSignatureKey(key);
    if (signature) {
      lookup.bySignature.set(signature, item.props);
    }
  });

  return lookup;
}

function getLineSpecialProps(
  lookup: LineSpecialLookup,
  relation: { id: string; baseId: string; signature: string; index: number },
): Partial<RelationModel> | undefined {
  return (
    lookup.byKey.get(relation.id) ??
    lookup.byBaseKey.get(relation.baseId) ??
    lookup.bySignature.get(relation.signature) ??
    lookup.unkeyedByIndex[relation.index]
  );
}

function stripGeneratedRelationIndex(key: string): string {
  return /^relation-.+-\d+$/.test(key) ? key.replace(/-\d+$/, "") : key;
}

function relationSignature(relation: ParsedRelation): string {
  return `${slugify(relation.fromTable)}.${slugify(relation.fromColumn)}>${slugify(
    relation.toTable,
  )}.${slugify(relation.toColumn)}`;
}

function normalizeRelationSignatureKey(key: string): string | undefined {
  const clean = key.trim().replace(/^relation:/i, "").replace(/\s+/g, "");
  const parts = clean.split(">");
  if (parts.length !== 2) return undefined;

  const from = parseSignatureEndpoint(parts[0]);
  const to = parseSignatureEndpoint(parts[1]);
  if (!from || !to) return undefined;

  return `${from.table}.${from.column}>${to.table}.${to.column}`;
}

function parseSignatureEndpoint(value: string): ParsedEndpoint | undefined {
  const parts = value.split(".");
  if (parts.length < 2) return undefined;

  const column = cleanIdentifier(parts.pop() || "");
  const table = cleanIdentifier(parts.join("."));
  if (!table || !column) return undefined;

  return {
    table: slugify(table),
    column: slugify(column),
    columns: [slugify(column)],
  };
}

function parseTables(
  source: string,
  tableProps: ReturnType<typeof parseSpecialComments>["tableProps"],
  defaultTable: TableModel["visual"],
): TableModel[] {
  return scanBlocks(source, "Table").map((block, index) => {
    const header = parseTableHeader(block.header);
    const tableName = header.name;
    const parsed = parseTableBody(tableName, block.lines);
    const special = tableProps.get(tableName) || tableProps.get(slugify(tableName));
    const measuredWidth = measureWidth(tableName, parsed.columns);
    const measuredHeight = getTableMinHeight(parsed.columns.length);
    const usesDefaultStyle = special?.usesDefaultStyle ?? true;
    const visual = usesDefaultStyle
      ? { ...defaultTable }
      : { ...defaultTable, ...(special?.visual ?? {}) };

    return {
      id: slugify(tableName),
      name: tableName,
      alias: header.alias,
      headerSettings: header.settings,
      columns: parsed.columns,
      partials: parsed.partials,
      x: special?.x ?? index * 300,
      y: special?.y ?? index * 120,
      width: special?.width || measuredWidth,
      height: measuredHeight,
      visual,
      usesDefaultStyle,
      usesGroupStyle: special?.usesGroupStyle ?? false,
      indexes: parsed.indexes,
      checks: parsed.checks,
      preservedBlocks: parsed.preservedBlocks,
      note: parsed.note,
      layoutSource: special?.layoutSource ?? "auto",
    };
  });
}

function createDiagramVisual(visual?: Partial<DiagramModel["visual"]>): DiagramModel["visual"] {
  return {
    backgroundColor: visual?.backgroundColor ?? defaultDiagramVisual.backgroundColor,
    gridColor: visual?.gridColor ?? defaultDiagramVisual.gridColor,
    gridSize: normalizeGridSize(visual?.gridSize, defaultDiagramVisual.gridSize),
    tableRouteMargin: normalizeRouteMargin(visual?.tableRouteMargin, defaultDiagramVisual.tableRouteMargin),
    defaultTable: {
      ...defaultTableVisual,
      ...(visual?.defaultTable ?? {}),
    },
    badges: {
      primaryKey: {
        ...defaultBadgeVisuals.primaryKey,
        ...(visual?.badges?.primaryKey ?? {}),
      },
      foreignKey: {
        ...defaultBadgeVisuals.foreignKey,
        ...(visual?.badges?.foreignKey ?? {}),
      },
      notNull: {
        ...defaultBadgeVisuals.notNull,
        ...(visual?.badges?.notNull ?? {}),
      },
      unique: {
        ...defaultBadgeVisuals.unique,
        ...(visual?.badges?.unique ?? {}),
      },
    },
    savedColors: [...(visual?.savedColors ?? [])],
  };
}

function parseTableHeader(value: string): { name: string; alias?: string; settings: string[] } {
  const settingsMatch = value.match(/\[([\s\S]+)\]\s*$/);
  const settings = settingsMatch ? splitSettings(settingsMatch[1]) : [];
  const declaration = (settingsMatch ? value.slice(0, settingsMatch.index) : value).trim();
  const aliasMatch = declaration.match(/^([\s\S]+?)\s+as\s+([^\s]+)$/i);
  const name = cleanIdentifier(aliasMatch?.[1] ?? declaration);
  const alias = aliasMatch ? cleanIdentifier(aliasMatch[2]) : undefined;
  return { name, alias, settings };
}

function parseTableBody(
  tableName: string,
  lines: string[],
): { columns: ColumnModel[]; indexes: TableIndexModel[]; checks: TableCheckModel[]; partials: string[]; preservedBlocks: string[]; note?: string } {
  const columns: ColumnModel[] = [];
  const indexes: TableIndexModel[] = [];
  const checks: TableCheckModel[] = [];
  const partials: string[] = [];
  const preservedBlocks: string[] = [];
  let note: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    let trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed === "}") continue;

    if (/^indexes\s*\{/i.test(trimmed)) {
      const block = collectNestedBlock(lines, index);
      index = block.endIndex;
      indexes.push(...parseIndexes(block.content));
      continue;
    }

    if (/^checks\s*\{/i.test(trimmed)) {
      const block = collectNestedBlock(lines, index);
      index = block.endIndex;
      checks.push(...parseChecks(block.content));
      continue;
    }

    if (/^[A-Za-z][A-Za-z0-9_]*(?:\s+[^\{]+)?\s*\{/i.test(trimmed)) {
      const block = collectNestedBlock(lines, index);
      index = block.endIndex;
      preservedBlocks.push(block.raw);
      continue;
    }

    if (trimmed.startsWith("~")) {
      partials.push(cleanIdentifier(trimmed.slice(1)));
      continue;
    }

    if (/^note\s*:/i.test(trimmed)) {
      const logical = collectLogicalStatement(lines, index);
      trimmed = logical.value.trim();
      index = logical.endIndex;
      note = cleanNote(trimmed.replace(/^note\s*:/i, ""));
      continue;
    }

    const logical = collectLogicalStatement(lines, index);
    trimmed = logical.value.trim();
    index = logical.endIndex;
    const column = parseColumn(tableName, trimmed, columns.length);
    if (column) {
      columns.push(column);
    }
  }

  return { columns, indexes, checks, partials, preservedBlocks, note };
}

function collectNestedBlock(lines: string[], startIndex: number): { content: string[]; raw: string; endIndex: number } {
  const rawLines = [lines[startIndex]];
  const state: LexicalState = {};
  let depth = braceDelta(lines[startIndex], state);
  let endIndex = startIndex;
  while (endIndex + 1 < lines.length && depth > 0) {
    endIndex += 1;
    rawLines.push(lines[endIndex]);
    depth += braceDelta(lines[endIndex], state);
  }
  return {
    content: rawLines.slice(1, -1).map((line) => line.trim()).filter(Boolean),
    raw: rawLines.map((line) => line.trim()).join("\n"),
    endIndex,
  };
}

function parseColumn(tableName: string, line: string, index: number): ColumnModel | undefined {
  const cleanLine = stripInlineComment(line).trim();
  if (!cleanLine || cleanLine.includes("{") || cleanLine === "}") return undefined;

  const match = cleanLine.match(/^("[^"]+"|`[^`]+`|[^\s]+)\s+([\s\S]+)$/);
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
      const originalSettings = settingsMatch ? splitSettings(settingsMatch[1]) : [];
      const settings = originalSettings.map((item) => item.toLowerCase());
      const columns = rawColumns
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(/,(?![^`]*`)/)
        .map((column) => column.trim().startsWith("`") ? column.trim() : cleanIdentifier(column.trim()))
        .filter(Boolean);

      return {
        columns,
        unique: settings.includes("unique"),
        primary: settings.includes("pk") || settings.includes("primary key"),
        name: extractSetting(originalSettings, "name"),
        type: extractSetting(originalSettings, "type"),
        settings: originalSettings,
        raw: line,
      };
    });
}

function parseChecks(lines: string[]): TableCheckModel[] {
  return lines.map((line) => stripInlineComment(line).trim()).filter(Boolean).map((line) => {
    const settingsMatch = line.match(/\[([\s\S]+)\]\s*$/);
    const settings = settingsMatch ? splitSettings(settingsMatch[1]) : [];
    const rawExpression = (settingsMatch ? line.slice(0, settingsMatch.index) : line).trim();
    const expression = rawExpression.startsWith("`") && rawExpression.endsWith("`")
      ? rawExpression.slice(1, -1)
      : rawExpression;
    return { expression, name: extractSetting(settings, "name"), settings, raw: line };
  });
}

function parseEnums(source: string): EnumModel[] {
  return scanBlocks(source, "Enum").map((block, index) => {
    const values: string[] = [];
    const valueSettings: Record<string, string[]> = {};
    let note: string | undefined;

    for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex += 1) {
      let line = stripInlineComment(block.lines[lineIndex]).trim();
      if (!line || line === "}") continue;
      if (/^note\s*:/i.test(line)) {
        const logical = collectLogicalStatement(block.lines, lineIndex);
        lineIndex = logical.endIndex;
        note = cleanNote(logical.value.replace(/^note\s*:/i, ""));
        continue;
      }
      const settingsMatch = line.match(/\[([\s\S]+)\]\s*$/);
      const rawName = (settingsMatch ? line.slice(0, settingsMatch.index) : line).trim();
      const name = cleanIdentifier(rawName);
      if (!name) continue;
      values.push(name);
      if (settingsMatch) valueSettings[name] = splitSettings(settingsMatch[1]);
    }

    return {
      id: makeId("enum", block.name, index),
      name: cleanIdentifier(block.name),
      values,
      valueSettings,
      note,
    };
  });
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
      continue;
    }

    const named = cleanLine.match(/^ref\s+([^:]+):\s*(.+)$/i);
    if (named) {
      const parsed = parseRelationExpression(named[2], cleanIdentifier(named[1]));
      if (parsed) relations.push(parsed);
    }
  }

  for (const block of scanBlocks(source, "Ref")) {
    for (const line of block.lines) {
      const parsed = parseRelationExpression(stripInlineComment(line).trim(), cleanIdentifier(block.name));
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

function parseRelationExpression(expression: string, dbmlName?: string): ParsedRelation | undefined {
  const settingsMatch = expression.match(/\[([\s\S]+)\]\s*$/);
  const cleanExpression = (settingsMatch ? expression.slice(0, settingsMatch.index) : expression).trim();
  const match = cleanExpression.match(/^([\s\S]+?)\s+(<>|[<>-])\s+([\s\S]+)$/);
  if (!match) return undefined;

  const left = parseEndpoint(match[1]);
  const right = parseEndpoint(match[3]);
  if (!left || !right) return undefined;

  const settings = settingsMatch ? splitSettings(settingsMatch[1]) : undefined;
  if (match[2] === "<") {
    return {
      fromTable: right.table,
      fromColumn: right.column,
      fromColumns: right.columns,
      toTable: left.table,
      toColumn: left.column,
      toColumns: left.columns,
      fromCardinality: "many",
      toCardinality: "one",
      dbmlName,
      dbmlOperator: "<",
      dbmlSettings: settings,
    };
  }

  return {
    fromTable: left.table,
    fromColumn: left.column,
    fromColumns: left.columns,
    toTable: right.table,
    toColumn: right.column,
    toColumns: right.columns,
    fromCardinality: match[2] === "-" ? "one" : "many",
    toCardinality: match[2] === "<>" ? "many" : "one",
    dbmlName,
    dbmlOperator: match[2] as RelationModel["dbmlOperator"],
    dbmlSettings: settings,
  };
}

function parseEndpoint(value: string): ParsedEndpoint | undefined {
  const clean = value.trim().replace(/[{}]/g, "");
  const tableComposite = clean.match(/^([\s\S]+?)\.\(([\s\S]+)\)$/);
  if (tableComposite) {
    const table = cleanIdentifier(tableComposite[1]);
    const columns = splitTopLevel(tableComposite[2], ",").map(cleanIdentifier).filter(Boolean);
    return table && columns.length ? { table, column: columns[0], columns } : undefined;
  }

  if (clean.startsWith("(") && clean.endsWith(")")) {
    const endpoints = splitTopLevel(clean.slice(1, -1), ",")
      .map((item) => parseEndpoint(item))
      .filter((item): item is ParsedEndpoint => Boolean(item));
    if (!endpoints.length || endpoints.some((item) => item.table !== endpoints[0].table)) return undefined;
    const columns = endpoints.flatMap((item) => item.columns);
    return { table: endpoints[0].table, column: columns[0], columns };
  }

  const parts = splitIdentifierPath(clean);
  if (parts.length < 2) return undefined;

  const column = cleanIdentifier(parts.pop() || "");
  const table = cleanIdentifier(parts.join("."));
  if (!table || !column) return undefined;

  return { table, column, columns: [column] };
}

function dedupeRelations(relations: ParsedRelation[]): ParsedRelation[] {
  const seen = new Set<string>();
  const next: ParsedRelation[] = [];

  for (const relation of relations) {
    const key = `${relation.fromTable}.[${relation.fromColumns?.join(",") ?? relation.fromColumn}]>${relation.toTable}.[${relation.toColumns?.join(",") ?? relation.toColumn}]`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(relation);
  }

  return next;
}

function scanBlocks(
  source: string,
  keyword: "Table" | "Enum" | "Ref" | "Project" | "TableGroup" | "TablePartial",
): Block[] {
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  const startPattern = new RegExp(`^\\s*${keyword}\\b\\s*([^\\{]*)`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(startPattern);
    if (!match || /^ref\s*:/i.test(line.trim())) continue;

    const lexicalState: LexicalState = {};
    let depth = braceDelta(line, lexicalState);
    if (depth <= 0) continue;

    const header = match[1].trim();
    const name = cleanBlockName(header);
    const blockLines: string[] = [];
    const rawLines = [line];

    while (index + 1 < lines.length && depth > 0) {
      index += 1;
      const blockLine = lines[index];
      rawLines.push(blockLine);
      depth += braceDelta(blockLine, lexicalState);
      if (depth > 0) blockLines.push(blockLine);
    }

    blocks.push({ name, header, lines: blockLines, raw: rawLines.join("\n") });
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
  let quote: string | undefined;
  let triple: string | undefined;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const three = line.slice(index, index + 3);
    if (triple) {
      if (three === triple) {
        triple = undefined;
        index += 2;
      }
      continue;
    }
    if (quote) {
      if (char === quote && !escaped) quote = undefined;
      escaped = char === "\\" && !escaped;
      continue;
    }
    if (three === "'''" || three === '\"\"\"') {
      triple = three;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
  }
  return line;
}

function cleanIdentifier(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'''") && trimmed.endsWith("'''")) ||
      (trimmed.startsWith('\"\"\"') && trimmed.endsWith('\"\"\"'))) {
    return trimmed.slice(3, -3);
  }
  return trimmed.replace(/^["'`]+|["'`]+$/g, "");
}

function cleanNote(value: string): string {
  const cleaned = cleanIdentifier(value.trim()).replace(/^\s*\n|\n\s*$/g, "");
  const lines = cleaned.split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const indent = indents.length ? Math.min(...indents) : 0;
  return indent ? lines.map((line) => line.slice(Math.min(indent, line.length))).join("\n") : cleaned;
}

function splitSettings(value: string): string[] {
  return splitTopLevel(value, ",").map((item) => item.trim()).filter(Boolean);
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  let triple: string | undefined;
  let escaped = false;
  let round = 0;
  let square = 0;
  let curly = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const three = value.slice(index, index + 3);
    if (triple) {
      current += char;
      if (three === triple) {
        current += value.slice(index + 1, index + 3);
        triple = undefined;
        index += 2;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote && !escaped) quote = undefined;
      escaped = char === "\\" && !escaped;
      continue;
    }
    if (three === "'''" || three === '\"\"\"') {
      triple = three;
      current += three;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") round += 1;
    else if (char === ")") round = Math.max(0, round - 1);
    else if (char === "[") square += 1;
    else if (char === "]") square = Math.max(0, square - 1);
    else if (char === "{") curly += 1;
    else if (char === "}") curly = Math.max(0, curly - 1);

    if (char === delimiter && round === 0 && square === 0 && curly === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function splitIdentifierPath(value: string): string[] {
  return splitTopLevel(value, ".").map((item) => item.trim()).filter(Boolean);
}

function collectLogicalStatement(lines: string[], startIndex: number): { value: string; endIndex: number } {
  let endIndex = startIndex;
  let value = lines[startIndex] ?? "";
  while (endIndex + 1 < lines.length && !isLogicalStatementComplete(value)) {
    endIndex += 1;
    value += `\n${lines[endIndex]}`;
  }
  return { value, endIndex };
}

function isLogicalStatementComplete(value: string): boolean {
  let quote: string | undefined;
  let triple: string | undefined;
  let escaped = false;
  let square = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const three = value.slice(index, index + 3);
    if (triple) {
      if (three === triple) {
        triple = undefined;
        index += 2;
      }
      continue;
    }
    if (quote) {
      if (char === quote && !escaped) quote = undefined;
      escaped = char === "\\" && !escaped;
      continue;
    }
    if (three === "'''" || three === '\"\"\"') {
      triple = three;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
  }
  return !quote && !triple && square <= 0;
}

function extractSetting(settings: string[], key: string): string | undefined {
  const found = settings.find((setting) => setting.toLowerCase().startsWith(`${key}:`));
  if (!found) return undefined;
  const value = found.slice(found.indexOf(":") + 1).trim();
  return key.toLowerCase() === "note" ? cleanNote(value) : cleanIdentifier(value);
}

function measureWidth(tableName: string, columns: ColumnModel[]): number {
  const longestColumn = columns.reduce((max, column) => {
    return Math.max(max, `${column.name} ${column.type}`.length);
  }, tableName.length);

  return Math.max(TABLE_MIN_WIDTH, longestColumn * 8 + TABLE_PADDING_X * 2 + 70);
}

interface LexicalState {
  quote?: string;
  triple?: string;
  escaped?: boolean;
}

function braceDelta(line: string, state: LexicalState = {}): number {
  let delta = 0;
  state.escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const three = line.slice(index, index + 3);
    if (state.triple) {
      if (three === state.triple) {
        state.triple = undefined;
        index += 2;
      }
      continue;
    }
    if (state.quote) {
      if (char === state.quote && !state.escaped) state.quote = undefined;
      state.escaped = char === "\\" && !state.escaped;
      continue;
    }
    if (three === "'''" || three === '\"\"\"') {
      state.triple = three;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      state.quote = char;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") break;
    if (char === "{") delta += 1;
    else if (char === "}") delta -= 1;
  }
  return delta;
}

interface CompatibilityMetadata {
  advancedBlocks: DbmlAdvancedBlock[];
  preservedStatements: string[];
  warnings: string[];
}

function extractCompatibilityMetadata(source: string): CompatibilityMetadata {
  const advancedBlocks: DbmlAdvancedBlock[] = [];
  const preservedStatements: string[] = [];
  const warnings: string[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("//")) {
      const commentLines = [line];
      const special = /^\/\/\s*@(diagram|table|line|group)\b/i.test(trimmed);
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith("//")) {
        index += 1;
        commentLines.push(lines[index]);
      }
      if (!special) preservedStatements.push(commentLines.join("\n"));
      continue;
    }

    const blockStart = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)\b([^\{]*)\{/);
    if (blockStart) {
      const keyword = blockStart[1];
      const rawLines = [line];
      const state: LexicalState = {};
      let depth = braceDelta(line, state);
      while (index + 1 < lines.length && depth > 0) {
        index += 1;
        rawLines.push(lines[index]);
        depth += braceDelta(lines[index], state);
      }

      if (/^(Table|Enum|Ref)$/i.test(keyword)) continue;
      const normalizedKind = normalizeAdvancedBlockKind(keyword);
      const name = cleanBlockName(blockStart[2]);
      const raw = rawLines.join("\n");
      const tables = normalizedKind === "TableGroup"
        ? rawLines.slice(1, -1)
          .map((item) => stripInlineComment(item).trim())
          .filter((item) => item && !/^note\s*:/i.test(item))
          .map(cleanIdentifier)
        : undefined;
      advancedBlocks.push({ kind: normalizedKind, name, raw, tables });

      if (normalizedKind === "TablePartial") {
        warnings.push(`TablePartial "${name}" foi preservado, mas sua composição ainda é somente leitura no editor visual.`);
      } else if (normalizedKind === "Project") {
        warnings.push(`Project "${name}" foi preservado e será exportado sem alterações; seus settings ainda não são editáveis visualmente.`);
      } else if (normalizedKind === "TableGroup") {
        warnings.push(`TableGroup "${name}" foi preservado; edite a associação oficial pelo DBML.`);
      } else if (isRecognizedReadOnlyBlock(keyword)) {
        warnings.push(`A sintaxe DBML "${keyword}${name ? ` ${name}` : ""}" é reconhecida, mas ainda é somente leitura; o bloco será preservado.`);
      } else {
        warnings.push(`Bloco DBML "${keyword}${name ? ` ${name}` : ""}" não é reconhecido pelo editor e será apenas preservado.`);
      }
      continue;
    }

    if (/^ref(?:\s+[^:]+)?\s*:/i.test(trimmed)) continue;
    preservedStatements.push(line);
    warnings.push(`A instrução "${trimmed.slice(0, 72)}" não é editável visualmente e será preservada na exportação.`);
  }

  return { advancedBlocks, preservedStatements, warnings: Array.from(new Set(warnings)) };
}

function isRecognizedReadOnlyBlock(keyword: string): boolean {
  return /^(records|diagramview|stickynote)$/i.test(keyword);
}

function normalizeAdvancedBlockKind(keyword: string): DbmlAdvancedBlock["kind"] {
  if (/^project$/i.test(keyword)) return "Project";
  if (/^tablegroup$/i.test(keyword)) return "TableGroup";
  if (/^tablepartial$/i.test(keyword)) return "TablePartial";
  return "Unknown";
}

function validateDbmlSyntax(source: string): void {
  const stack: Array<{ char: string; line: number; column: number }> = [];
  const matching: Record<string, string> = {
    "}": "{",
    "]": "[",
    ")": "(",
  };

  let triple: { marker: string; line: number; column: number } | undefined;

  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    let quote: string | undefined;
    let escaped = false;

    for (let columnIndex = 0; columnIndex < line.length; columnIndex += 1) {
      const char = line[columnIndex];
      const next = line[columnIndex + 1];
      const three = line.slice(columnIndex, columnIndex + 3);

      if (triple) {
        if (three === triple.marker) {
          triple = undefined;
          columnIndex += 2;
        }
        continue;
      }

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

      if (three === "'''" || three === '\"\"\"') {
        triple = { marker: three, line: lineIndex + 1, column: columnIndex + 1 };
        columnIndex += 2;
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

  if (triple) {
    throw new Error(`Linha ${triple.line}: texto multilinha "${triple.marker}" nao foi fechado.`);
  }

  const open = stack.pop();
  if (open) {
    throw new Error(`Linha ${open.line}: abertura "${open.char}" nao foi fechada.`);
  }
}
