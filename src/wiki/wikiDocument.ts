import { getVisualColumns } from "../model/tableColumns";
import type { ColumnModel, DiagramModel, TableModel } from "../model/types";
import { slugify, uniqueId } from "../utils/id";

export const WIKI_DOCUMENT_VERSION = 2 as const;

export interface WikiSourceBinding {
  sourceId: string;
  name: string;
  aliases: string[];
  signature: string;
}

export interface WikiFieldDocumentation {
  id: string;
  binding: WikiSourceBinding;
  description: string;
}

export interface WikiBusinessRule {
  id: string;
  text: string;
}

export interface WikiTableDocumentation {
  id: string;
  binding: WikiSourceBinding;
  description: string;
  fields: WikiFieldDocumentation[];
  archivedFields: WikiFieldDocumentation[];
  businessRules: WikiBusinessRule[];
}

export interface WikiCustomSection {
  id: string;
  title: string;
  body: string;
}

export interface WikiExportOptions {
  includeToc: boolean;
  includeEnums: boolean;
  includeRelationships: boolean;
}

export interface WikiDocument {
  version: typeof WIKI_DOCUMENT_VERSION;
  project: {
    title: string;
    summary: string;
    introduction: string;
    overview: string;
    conclusion: string;
  };
  tables: WikiTableDocumentation[];
  archivedTables: WikiTableDocumentation[];
  customSections: WikiCustomSection[];
  options: WikiExportOptions;
}

export interface WikiReconcileResult {
  document: WikiDocument;
  addedTables: number;
  archivedTables: number;
  addedFields: number;
  archivedFields: number;
}

export function createWikiDocument(diagram: DiagramModel, projectName: string): WikiDocument {
  const normalizedName = projectName.trim() || "Wiki do Projeto";
  return {
    version: WIKI_DOCUMENT_VERSION,
    project: {
      title: normalizedName,
      summary: `Documentação técnica e funcional do banco de dados do projeto ${normalizedName}.`,
      introduction: "",
      overview: "",
      conclusion: "",
    },
    tables: diagram.tables.map((table) => createTableDocumentation(table)),
    archivedTables: [],
    customSections: [],
    options: { includeToc: true, includeEnums: true, includeRelationships: true },
  };
}

export function reconcileWikiDocument(
  input: WikiDocument,
  diagram: DiagramModel,
  projectName: string,
): WikiReconcileResult {
  const document = normalizeWikiDocument(input, projectName);
  const available = [...document.tables, ...document.archivedTables];
  const matched = new Set<string>();
  let addedTables = 0;
  let addedFields = 0;
  let archivedFields = 0;

  const tables = diagram.tables.map((table) => {
    const existing = findTableDocumentation(available, matched, table);
    if (!existing) {
      addedTables += 1;
      addedFields += table.columns.length;
      return createTableDocumentation(table);
    }
    matched.add(existing.id);
    const reconciled = reconcileTableDocumentation(existing, table);
    addedFields += reconciled.addedFields;
    archivedFields += reconciled.archivedFields;
    return reconciled.table;
  });

  const archivedTables = available.filter((item) => !matched.has(item.id));
  const previouslyActive = new Set(document.tables.map((item) => item.id));
  const newlyArchivedTables = archivedTables.filter((item) => previouslyActive.has(item.id)).length;

  return {
    document: { ...document, tables, archivedTables },
    addedTables,
    archivedTables: newlyArchivedTables,
    addedFields,
    archivedFields,
  };
}

export function serializeWikiDocument(document: WikiDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseWikiDocument(value: string | undefined): WikiDocument | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isWikiDocument(parsed) ? normalizeWikiDocument(parsed, parsed.project.title) : undefined;
  } catch {
    return undefined;
  }
}

export function createWikiBusinessRule(text = ""): WikiBusinessRule {
  return { id: uniqueId("wiki-rule"), text };
}

export function createWikiCustomSection(title = "Nova seção"): WikiCustomSection {
  return { id: uniqueId("wiki-section"), title, body: "" };
}

export function getTableDocumentationProgress(table: WikiTableDocumentation): number {
  const documentedFields = table.fields.filter((field) => field.description.trim()).length;
  const total = table.fields.length + 1;
  const completed = documentedFields + (table.description.trim() ? 1 : 0);
  return total === 0 ? 100 : Math.round((completed / total) * 100);
}

export function getWikiCompletion(document: WikiDocument): { completed: number; total: number; percentage: number } {
  const generalValues = [
    document.project.title,
    document.project.summary,
    document.project.introduction,
    document.project.overview,
    document.project.conclusion,
  ];
  const fieldValues = document.tables.flatMap((table) => [
    table.description,
    ...table.fields.map((field) => field.description),
  ]);
  const values = [...generalValues, ...fieldValues];
  const completed = values.filter((value) => value.trim()).length;
  return {
    completed,
    total: values.length,
    percentage: values.length ? Math.round((completed / values.length) * 100) : 100,
  };
}

function reconcileTableDocumentation(
  current: WikiTableDocumentation,
  table: TableModel,
): { table: WikiTableDocumentation; addedFields: number; archivedFields: number } {
  const available = [...current.fields, ...current.archivedFields];
  const matched = new Set<string>();
  let addedFields = 0;
  const fields = getVisualColumns(table).map((column) => {
    const existing = findFieldDocumentation(available, matched, column);
    if (!existing) {
      addedFields += 1;
      return createFieldDocumentation(column);
    }
    matched.add(existing.id);
    return { ...existing, binding: updateBinding(existing.binding, columnBinding(column)) };
  });
  const activeIds = new Set(current.fields.map((field) => field.id));
  const archivedFields = available.filter((field) => !matched.has(field.id));
  return {
    table: {
      ...current,
      binding: updateBinding(current.binding, tableBinding(table)),
      fields,
      archivedFields,
    },
    addedFields,
    archivedFields: archivedFields.filter((field) => activeIds.has(field.id)).length,
  };
}

function createTableDocumentation(table: TableModel): WikiTableDocumentation {
  return {
    id: uniqueId(`wiki-table-${slugify(table.name)}`),
    binding: tableBinding(table),
    description: table.note?.trim() ?? "",
    fields: getVisualColumns(table).map((column) => createFieldDocumentation(column)),
    archivedFields: [],
    businessRules: [],
  };
}

function createFieldDocumentation(column: ColumnModel): WikiFieldDocumentation {
  return {
    id: uniqueId(`wiki-field-${slugify(column.name)}`),
    binding: columnBinding(column),
    description: column.note?.trim() ?? "",
  };
}

function findTableDocumentation(
  candidates: WikiTableDocumentation[],
  matched: Set<string>,
  table: TableModel,
): WikiTableDocumentation | undefined {
  const available = candidates.filter((candidate) => !matched.has(candidate.id));
  return findByBinding(available, tableBinding(table), (item) => item.binding);
}

function findFieldDocumentation(
  candidates: WikiFieldDocumentation[],
  matched: Set<string>,
  column: ColumnModel,
): WikiFieldDocumentation | undefined {
  const available = candidates.filter((candidate) => !matched.has(candidate.id));
  return findByBinding(available, columnBinding(column), (item) => item.binding);
}

function findByBinding<T>(
  candidates: T[],
  binding: WikiSourceBinding,
  select: (item: T) => WikiSourceBinding,
): T | undefined {
  const byId = candidates.filter((item) => select(item).sourceId === binding.sourceId);
  if (byId.length === 1) return byId[0];
  const normalizedName = binding.name.toLocaleLowerCase();
  const byName = candidates.filter((item) => {
    const current = select(item);
    return current.name.toLocaleLowerCase() === normalizedName ||
      current.aliases.some((alias) => alias.toLocaleLowerCase() === normalizedName);
  });
  if (byName.length === 1) return byName[0];
  const bySignature = candidates.filter((item) => select(item).signature === binding.signature);
  return bySignature.length === 1 ? bySignature[0] : undefined;
}

function tableBinding(table: TableModel): WikiSourceBinding {
  const signature = table.columns
    .map((column) => columnSignature(column))
    .sort()
    .join("||");
  return { sourceId: table.id, name: table.name, aliases: [], signature };
}

function columnBinding(column: ColumnModel): WikiSourceBinding {
  return { sourceId: column.id, name: column.name, aliases: [], signature: columnSignature(column) };
}

function columnSignature(column: ColumnModel): string {
  return [
    column.type.trim().toLocaleLowerCase(),
    column.primaryKey ? "pk" : "",
    column.foreignKey ? "fk" : "",
    column.nullable ? "nullable" : "required",
    column.unique ? "unique" : "",
  ].join("|");
}

function updateBinding(previous: WikiSourceBinding, current: WikiSourceBinding): WikiSourceBinding {
  const aliases = new Set(previous.aliases);
  if (previous.name && previous.name !== current.name) aliases.add(previous.name);
  aliases.delete(current.name);
  return { ...current, aliases: [...aliases] };
}

function normalizeWikiDocument(document: WikiDocument, projectName: string): WikiDocument {
  return {
    version: WIKI_DOCUMENT_VERSION,
    project: {
      title: document.project.title || projectName || "Wiki do Projeto",
      summary: document.project.summary ?? "",
      introduction: document.project.introduction ?? "",
      overview: document.project.overview ?? "",
      conclusion: document.project.conclusion ?? "",
    },
    tables: document.tables.map(normalizeTableDocumentation),
    archivedTables: (document.archivedTables ?? []).map(normalizeTableDocumentation),
    customSections: (document.customSections ?? []).map((section) => ({
      id: section.id || uniqueId("wiki-section"),
      title: section.title || "Seção sem título",
      body: section.body ?? "",
    })),
    options: {
      includeToc: document.options?.includeToc ?? true,
      includeEnums: document.options?.includeEnums ?? true,
      includeRelationships: document.options?.includeRelationships ?? true,
    },
  };
}

function normalizeTableDocumentation(table: WikiTableDocumentation): WikiTableDocumentation {
  return {
    ...table,
    id: table.id || uniqueId("wiki-table"),
    binding: normalizeBinding(table.binding),
    description: table.description ?? "",
    fields: (table.fields ?? []).map(normalizeFieldDocumentation),
    archivedFields: (table.archivedFields ?? []).map(normalizeFieldDocumentation),
    businessRules: (table.businessRules ?? []).map((rule) => ({
      id: rule.id || uniqueId("wiki-rule"),
      text: rule.text ?? "",
    })),
  };
}

function normalizeFieldDocumentation(field: WikiFieldDocumentation): WikiFieldDocumentation {
  return {
    ...field,
    id: field.id || uniqueId("wiki-field"),
    binding: normalizeBinding(field.binding),
    description: field.description ?? "",
  };
}

function normalizeBinding(binding: WikiSourceBinding): WikiSourceBinding {
  return {
    sourceId: binding.sourceId ?? "",
    name: binding.name ?? "",
    aliases: Array.isArray(binding.aliases) ? binding.aliases.filter((item) => typeof item === "string") : [],
    signature: binding.signature ?? "",
  };
}

function isWikiDocument(value: unknown): value is WikiDocument {
  if (!isRecord(value)) return false;
  const item = value as Partial<WikiDocument>;
  return item.version === WIKI_DOCUMENT_VERSION &&
    isProject(item.project) &&
    Array.isArray(item.tables) && item.tables.every(isTableDocumentation) &&
    (item.archivedTables === undefined ||
      (Array.isArray(item.archivedTables) && item.archivedTables.every(isTableDocumentation))) &&
    (item.customSections === undefined ||
      (Array.isArray(item.customSections) && item.customSections.every(isCustomSection))) &&
    (item.options === undefined || isExportOptions(item.options));
}

function isProject(value: unknown): value is WikiDocument["project"] {
  if (!isRecord(value)) return false;
  return ["title", "summary", "introduction", "overview", "conclusion"]
    .every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isTableDocumentation(value: unknown): value is WikiTableDocumentation {
  if (!isRecord(value) || !isOptionalString(value.id) || !isBinding(value.binding) ||
    !isOptionalString(value.description) || !Array.isArray(value.fields) ||
    !value.fields.every(isFieldDocumentation)) return false;
  return (value.archivedFields === undefined ||
      (Array.isArray(value.archivedFields) && value.archivedFields.every(isFieldDocumentation))) &&
    (value.businessRules === undefined ||
      (Array.isArray(value.businessRules) && value.businessRules.every(isBusinessRule)));
}

function isFieldDocumentation(value: unknown): value is WikiFieldDocumentation {
  return isRecord(value) && isOptionalString(value.id) && isBinding(value.binding) &&
    isOptionalString(value.description);
}

function isBinding(value: unknown): value is WikiSourceBinding {
  return isRecord(value) && isOptionalString(value.sourceId) && isOptionalString(value.name) &&
    isOptionalString(value.signature) &&
    (value.aliases === undefined ||
      (Array.isArray(value.aliases) && value.aliases.every((item) => typeof item === "string")));
}

function isBusinessRule(value: unknown): value is WikiBusinessRule {
  return isRecord(value) && isOptionalString(value.id) && isOptionalString(value.text);
}

function isCustomSection(value: unknown): value is WikiCustomSection {
  return isRecord(value) && isOptionalString(value.id) && isOptionalString(value.title) &&
    isOptionalString(value.body);
}

function isExportOptions(value: unknown): value is WikiExportOptions {
  if (!isRecord(value)) return false;
  return ["includeToc", "includeEnums", "includeRelationships"]
    .every((key) => value[key] === undefined || typeof value[key] === "boolean");
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
