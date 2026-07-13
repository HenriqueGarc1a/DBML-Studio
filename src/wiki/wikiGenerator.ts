import { getVisualColumns } from "../model/tableColumns";
import type { Cardinality, DiagramModel, RelationModel, TableModel } from "../model/types";

export const DATA_DICTIONARY_START_MARKER = "<!-- DBML-STUDIO:DATA-DICTIONARY:START -->";
export const DATA_DICTIONARY_END_MARKER = "<!-- DBML-STUDIO:DATA-DICTIONARY:END -->";

export interface WikiGeneratorOptions {
  projectName?: string;
}

/**
 * Creates the complete, editable starting document for a project wiki.
 * The data dictionary is delimited so it can be regenerated independently.
 */
export function generateWikiMarkdown(
  diagram: DiagramModel,
  options: WikiGeneratorOptions = {},
): string {
  const projectName = normalizeProjectName(options.projectName);
  const enumSummary = generateEnumSummary(diagram);

  return [
    `# ${escapeHeading(projectName)}`,
    "",
    "| [Início](#início) | [Introdução](#introdução) | [Visão Geral](#visão-geral-do-banco-de-dados) | [Dicionário de Dados](#dicionário-de-dados) | [Conclusão](#conclusão) |",
    "| --- | --- | --- | --- | --- |",
    "",
    "_TOC_",
    "",
    "# Início",
    "",
    `Esta wiki reúne a documentação técnica e funcional do banco de dados do projeto **${escapeInline(projectName)}**.`,
    "",
    "# Introdução",
    "",
    `O projeto **${escapeInline(projectName)}** utiliza o esquema descrito abaixo. Use esta seção para registrar o contexto do produto, seus objetivos e o escopo desta documentação.`,
    "",
    "# Visão Geral do Banco de Dados",
    "",
    `O banco de dados possui **${diagram.tables.length} ${pluralize(diagram.tables.length, "tabela", "tabelas")}**, **${diagram.relations.length} ${pluralize(diagram.relations.length, "relacionamento", "relacionamentos")}** e **${diagram.enums.length} ${pluralize(diagram.enums.length, "enumeração", "enumerações")}**.`,
    "",
    "Descreva aqui como os dados se organizam, quais áreas do sistema são atendidas e quais decisões estruturais são importantes para a manutenção do projeto.",
    enumSummary ? `\n${enumSummary}` : "",
    "",
    generateDataDictionaryMarkdown(diagram),
    "",
    "# Conclusão",
    "",
    "Use esta seção para resumir os principais pontos do modelo de dados, decisões relevantes e próximos passos da documentação.",
    "",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}

/** Generates the replaceable data-dictionary block, including its stable markers. */
export function generateDataDictionaryMarkdown(diagram: DiagramModel): string {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  const sections = diagram.tables.map((table) =>
    generateTableDictionary(table, diagram.relations, tableMap),
  );

  return [
    DATA_DICTIONARY_START_MARKER,
    "# Dicionário de Dados",
    "",
    "> Conteúdo gerado a partir do esquema atual. As descrições usam as notas cadastradas nas tabelas e nos campos.",
    "",
    ...(sections.length > 0
      ? intersperse(sections, "\n")
      : ["_O esquema ainda não possui tabelas para documentar._"]),
    DATA_DICTIONARY_END_MARKER,
  ].join("\n");
}

/**
 * Replaces only the generated dictionary. Text before and after the markers is
 * returned byte-for-byte unchanged. If an older wiki has no markers, the new
 * block is inserted immediately before its conclusion (or appended at the end).
 */
export function updateDataDictionaryMarkdown(markdown: string, diagram: DiagramModel): string {
  const startIndex = markdown.indexOf(DATA_DICTIONARY_START_MARKER);
  const endIndex = markdown.indexOf(DATA_DICTIONARY_END_MARKER);
  const startMarkerCount = countOccurrences(markdown, DATA_DICTIONARY_START_MARKER);
  const endMarkerCount = countOccurrences(markdown, DATA_DICTIONARY_END_MARKER);

  if (
    (startIndex === -1) !== (endIndex === -1) ||
    endIndex < startIndex ||
    startMarkerCount > 1 ||
    endMarkerCount > 1
  ) {
    throw new Error("Os marcadores do Dicionário de Dados estão incompletos ou fora de ordem.");
  }

  if (startIndex !== -1) {
    const afterEnd = endIndex + DATA_DICTIONARY_END_MARKER.length;
    const currentDictionary = markdown.slice(startIndex, afterEnd);
    const preservedContent = parseGeneratedDictionary(currentDictionary);
    const replacement = generateDataDictionaryMarkdownWithContent(diagram, preservedContent);
    return `${markdown.slice(0, startIndex)}${replacement}${markdown.slice(afterEnd)}`;
  }

  const replacement = generateDataDictionaryMarkdown(diagram);

  const conclusionIndex = findConclusionIndex(markdown);
  if (conclusionIndex !== -1) {
    const prefix = markdown.slice(0, conclusionIndex).replace(/\s*$/, "");
    const conclusion = markdown.slice(conclusionIndex).replace(/^\s*/, "");
    return `${prefix}\n\n${replacement}\n\n${conclusion}`;
  }

  const prefix = markdown.replace(/\s*$/, "");
  return prefix ? `${prefix}\n\n${replacement}\n` : `${replacement}\n`;
}

interface PreservedTableContent {
  description?: string;
  fieldDescriptions: Map<string, string>;
  businessRules?: string;
}

type PreservedDictionaryContent = Map<string, PreservedTableContent>;

const TABLE_DESCRIPTION_PLACEHOLDER =
  "> Adicione uma descrição para explicar a responsabilidade desta tabela no sistema.";
const EMPTY_DICTIONARY_PLACEHOLDER = "_O esquema ainda não possui tabelas para documentar._";

function generateDataDictionaryMarkdownWithContent(
  diagram: DiagramModel,
  preservedContent: PreservedDictionaryContent,
): string {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  const sections = diagram.tables.map((table) =>
    generateTableDictionary(
      table,
      diagram.relations,
      tableMap,
      preservedContent.get(escapeHeading(table.name)),
    ),
  );

  return [
    DATA_DICTIONARY_START_MARKER,
    "# Dicionário de Dados",
    "",
    "> Conteúdo gerado a partir do esquema atual. As descrições usam as notas cadastradas nas tabelas e nos campos.",
    "",
    ...(sections.length > 0 ? intersperse(sections, "\n") : [EMPTY_DICTIONARY_PLACEHOLDER]),
    DATA_DICTIONARY_END_MARKER,
  ].join("\n");
}

/**
 * Reads only the rigid structure emitted by this generator. Being strict here
 * is intentional: refreshing an unknown block must never silently erase prose.
 */
function parseGeneratedDictionary(dictionary: string): PreservedDictionaryContent {
  const inner = dictionary
    .slice(
      DATA_DICTIONARY_START_MARKER.length,
      dictionary.length - DATA_DICTIONARY_END_MARKER.length,
    )
    .replace(/^\r?\n/, "")
    .replace(/\r?\n$/, "");
  const lines = inner.split(/\r?\n/);
  const dictionaryHeadingIndex = lines.findIndex((line) => line.trim() === "# Dicionário de Dados");

  if (dictionaryHeadingIndex === -1) {
    throwUnrecognizedDictionary();
  }

  const sectionStarts = lines.flatMap((line, index) =>
    /^##\s+\S/.test(line) ? [index] : [],
  );

  if (sectionStarts.length === 0) {
    if (!lines.some((line) => line.trim() === EMPTY_DICTIONARY_PLACEHOLDER)) {
      throwUnrecognizedDictionary();
    }
    return new Map();
  }

  const result: PreservedDictionaryContent = new Map();

  for (let sectionIndex = 0; sectionIndex < sectionStarts.length; sectionIndex += 1) {
    const start = sectionStarts[sectionIndex];
    const end = sectionStarts[sectionIndex + 1] ?? lines.length;
    const section = lines.slice(start, end);
    const tableKey = section[0].replace(/^##\s+/, "").trim();

    if (!tableKey || result.has(tableKey)) throwUnrecognizedDictionary();

    const fieldsHeaderIndex = section.findIndex(
      (line) => line.trim() === "| Campo | Tipo | Descrição | Restrição |",
    );
    const relationshipsIndex = section.findIndex(
      (line) => line.trim() === "### Relacionamentos",
    );
    const businessRulesIndex = section.findIndex(
      (line) => line.trim() === "### Regras de Negócio",
    );

    if (
      fieldsHeaderIndex <= 0 ||
      relationshipsIndex <= fieldsHeaderIndex + 1 ||
      businessRulesIndex <= relationshipsIndex
    ) {
      throwUnrecognizedDictionary();
    }

    const divider = splitMarkdownTableRow(section[fieldsHeaderIndex + 1]);
    if (!divider || divider.length !== 4 || divider.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
      throwUnrecognizedDictionary();
    }

    const description = section
      .slice(1, fieldsHeaderIndex)
      .join("\n")
      .trim();
    if (!description) throwUnrecognizedDictionary();

    const fieldDescriptions = new Map<string, string>();
    const fieldLines = section
      .slice(fieldsHeaderIndex + 2, relationshipsIndex)
      .filter((line) => line.trim() !== "");

    for (const row of fieldLines) {
      const cells = splitMarkdownTableRow(row);
      if (!cells || cells.length !== 4) throwUnrecognizedDictionary();

      const [fieldCell, typeCell, fieldDescription, restriction] = cells;
      const emptyTableRow =
        fieldCell === "—" &&
        typeCell === "—" &&
        fieldDescription === "_Nenhum campo cadastrado._" &&
        restriction === "—";

      if (emptyTableRow) continue;
      if (
        !isInlineCodeCell(fieldCell) ||
        !isInlineCodeCell(typeCell) ||
        !fieldDescription ||
        !restriction ||
        fieldDescriptions.has(fieldCell)
      ) {
        throwUnrecognizedDictionary();
      }

      if (fieldDescription !== "_A documentar._") {
        fieldDescriptions.set(fieldCell, fieldDescription);
      }
    }

    const relationships = section
      .slice(relationshipsIndex + 1, businessRulesIndex)
      .join("\n")
      .trim();
    const businessRules = section
      .slice(businessRulesIndex + 1)
      .join("\n")
      .trim();
    if (!relationships || !businessRules) throwUnrecognizedDictionary();

    result.set(tableKey, {
      description: description === TABLE_DESCRIPTION_PLACEHOLDER ? undefined : description,
      fieldDescriptions,
      businessRules: isGeneratedBusinessRulesPlaceholder(businessRules)
        ? undefined
        : businessRules,
    });
  }

  return result;
}

function splitMarkdownTableRow(row: string): string[] | null {
  const trimmed = row.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  const cells: string[] = [];
  let current = "";
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const character = trimmed[index];
    if (character === "|" && !isEscapedAt(trimmed, index)) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isEscapedAt(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isInlineCodeCell(value: string): boolean {
  return value.length >= 3 && value.startsWith("`") && value.endsWith("`");
}

function isGeneratedBusinessRulesPlaceholder(value: string): boolean {
  return /^- \[ \] Documentar as regras de negócio relacionadas à tabela `.+`\.$/.test(value);
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function throwUnrecognizedDictionary(): never {
  throw new Error(
    "O bloco do Dicionário de Dados não está no formato esperado. A atualização foi cancelada para preservar o conteúdo.",
  );
}

function generateTableDictionary(
  table: TableModel,
  relations: RelationModel[],
  tableMap: Map<string, TableModel>,
  preservedContent?: PreservedTableContent,
): string {
  const tableRelations = relations.filter(
    (relation) => relation.fromTable === table.id || relation.toTable === table.id,
  );
  const tableDescription =
    preservedContent?.description ??
    (table.note ? formatBlockquote(table.note) : TABLE_DESCRIPTION_PLACEHOLDER);
  const rows = getVisualColumns(table).map((column) => {
    const fieldKey = `\`${escapeInlineCode(column.name)}\``;
    const description =
      preservedContent?.fieldDescriptions.get(fieldKey) ??
      (column.note ? escapeTableCell(column.note) : "_A documentar._");
    const restrictions = getColumnRestrictions(table, column.name, column, relations, tableMap);
    return `| \`${escapeInlineCode(column.name)}\` | \`${escapeInlineCode(column.type)}\` | ${description} | ${restrictions} |`;
  });

  return [
    `## ${escapeHeading(table.name)}`,
    "",
    tableDescription,
    "",
    "| Campo | Tipo | Descrição | Restrição |",
    "| --- | --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| — | — | _Nenhum campo cadastrado._ | — |"]),
    "",
    "### Relacionamentos",
    "",
    ...(tableRelations.length > 0
      ? tableRelations.map((relation) => formatRelationship(relation, table, tableMap))
      : ["_Nenhum relacionamento mapeado para esta tabela._"]),
    "",
    "### Regras de Negócio",
    "",
    preservedContent?.businessRules ??
      `- [ ] Documentar as regras de negócio relacionadas à tabela \`${escapeInlineCode(table.name)}\`.`,
  ].join("\n");
}

function getColumnRestrictions(
  table: TableModel,
  columnName: string,
  column: TableModel["columns"][number],
  relations: RelationModel[],
  tableMap: Map<string, TableModel>,
): string {
  const restrictions: string[] = [];
  const primaryIndexes = table.indexes.filter(
    (index) => index.primary && index.columns.includes(columnName),
  );
  const uniqueIndexes = table.indexes.filter(
    (index) => index.unique && index.columns.includes(columnName),
  );
  const references = relations.filter(
    (relation) => relation.fromTable === table.id && relation.fromColumn === columnName,
  );

  if (column.primaryKey || primaryIndexes.length > 0) {
    const composite = primaryIndexes.find((index) => index.columns.length > 1);
    restrictions.push(composite ? `PK (${formatColumnList(composite.columns)})` : "PK");
  }

  if (references.length > 0) {
    for (const relation of references) {
      const target = tableMap.get(relation.toTable);
      const targetTable = target?.name ?? relation.toTable;
      restrictions.push(
        `FK → \`${escapeInlineCode(targetTable)}.${escapeInlineCode(relation.toColumn)}\``,
      );
    }
  } else if (column.foreignKey) {
    restrictions.push("FK");
  }

  if (!column.nullable) restrictions.push("NOT NULL");

  if (column.unique || uniqueIndexes.length > 0) {
    const composite = uniqueIndexes.find((index) => index.columns.length > 1);
    restrictions.push(composite ? `UNIQUE (${formatColumnList(composite.columns)})` : "UNIQUE");
  }

  if (column.defaultValue !== undefined && column.defaultValue !== "") {
    restrictions.push(`DEFAULT \`${escapeInlineCode(column.defaultValue)}\``);
  }

  return restrictions.length > 0 ? restrictions.join("<br>") : "—";
}

function formatRelationship(
  relation: RelationModel,
  table: TableModel,
  tableMap: Map<string, TableModel>,
): string {
  const fromTable = tableMap.get(relation.fromTable)?.name ?? relation.fromTable;
  const toTable = tableMap.get(relation.toTable)?.name ?? relation.toTable;
  const fromEndpoint = `\`${escapeInlineCode(fromTable)}.${escapeInlineCode(relation.fromColumn)}\``;
  const toEndpoint = `\`${escapeInlineCode(toTable)}.${escapeInlineCode(relation.toColumn)}\``;
  const label = relation.label.trim() ? ` — ${escapeInline(relation.label.trim())}` : "";

  if (relation.fromTable === table.id) {
    return `- ${fromEndpoint} referencia ${toEndpoint} (${formatCardinality(relation.fromCardinality)} para ${formatCardinality(relation.toCardinality)})${label}.`;
  }

  return `- ${toEndpoint} é referenciado por ${fromEndpoint} (${formatCardinality(relation.toCardinality)} para ${formatCardinality(relation.fromCardinality)})${label}.`;
}

function generateEnumSummary(diagram: DiagramModel): string {
  if (diagram.enums.length === 0) return "";

  return [
    "## Enumerações",
    "",
    ...diagram.enums.map((item) => {
      const values = item.values.length
        ? item.values.map((value) => `\`${escapeInlineCode(value)}\``).join(", ")
        : "_sem valores cadastrados_";
      return `- **${escapeInline(item.name)}:** ${values}`;
    }),
  ].join("\n");
}

function normalizeProjectName(projectName: string | undefined): string {
  const normalized = projectName?.replace(/\s+/g, " ").trim();
  return normalized || "Wiki do Projeto";
}

function formatCardinality(cardinality: Cardinality): string {
  return cardinality === "one" ? "um" : "muitos";
}

function formatColumnList(columns: string[]): string {
  return columns.map((name) => `\`${escapeInlineCode(name)}\``).join(", ");
}

function formatBlockquote(value: string): string {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line.replace(/\|/g, "\\|")}`)
    .join("\n");
}

function escapeTableCell(value: string): string {
  return value.trim().replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function escapeInline(value: string): string {
  return value.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
}

function escapeHeading(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/([\\`*_{}\[\]<>#])/g, "\\$1");
}

function escapeInlineCode(value: string): string {
  return String(value).replace(/`/g, "\\`").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function findConclusionIndex(markdown: string): number {
  const match = /^#\s+Conclusão\s*$/im.exec(markdown);
  return match?.index ?? -1;
}

function intersperse(items: string[], separator: string): string[] {
  return items.flatMap((item, index) => (index === items.length - 1 ? [item] : [item, separator]));
}
