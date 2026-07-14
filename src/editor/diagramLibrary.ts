import { defaultDiagramVisual } from "../model/defaults";
import { readJson, safeGetItem, safeSetItem, writeJson } from "../utils/storage";
import { demoDbml } from "./demoDbml";

export interface SavedDiagram {
  id: string;
  name: string;
  dbml: string;
  wiki?: string;
  wikiDocument?: string;
  uiLayout?: string;
  previewDataUrl?: string;
  updatedAt: number;
  filename?: string;
}

export interface TrashedDiagram extends SavedDiagram {
  trashedAt: number;
}

export interface DiagramLibrary {
  diagrams: SavedDiagram[];
  activeDiagramId: string;
  activeDiagram: SavedDiagram;
}

export const LEGACY_SAVED_DBML_KEY = "dbml-studio-saved-dbml";
const DIAGRAMS_STORAGE_KEY = "dbml-studio-diagrams";
const ACTIVE_DIAGRAM_STORAGE_KEY = "dbml-studio-active-diagram-id";
const TRASHED_DIAGRAMS_STORAGE_KEY = "dbml-studio-trashed-diagrams";
export const ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY = "dbml-studio-active-diagram-filename";

export function loadDiagramLibrary(): DiagramLibrary {
  const stored = readStoredDiagrams();
  const legacyDbml = safeGetItem(LEGACY_SAVED_DBML_KEY);
  const diagrams = stored.length ? stored : [{
    id: `file:${dbmlFilename("Diagrama 1")}`, name: "Diagrama 1", dbml: migrateDarkOnlyDbml(legacyDbml ?? demoDbml),
    updatedAt: Date.now(), filename: dbmlFilename("Diagrama 1"),
  }];
  const activeId = safeGetItem(ACTIVE_DIAGRAM_STORAGE_KEY);
  const activeFilename = safeGetItem(ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY);
  const activeDiagram = diagrams.find((item) => item.id === activeId) ?? diagrams.find((item) => item.filename === activeFilename) ?? diagrams[0];
  writeDiagramLibrary(diagrams, activeDiagram.id);
  return { diagrams, activeDiagramId: activeDiagram.id, activeDiagram };
}

export function writeDiagramLibrary(diagrams: SavedDiagram[], activeDiagramId: string): void {
  const active = diagrams.find((item) => item.id === activeDiagramId);
  writeJson(DIAGRAMS_STORAGE_KEY, diagrams);
  safeSetItem(ACTIVE_DIAGRAM_STORAGE_KEY, activeDiagramId);
  if (active?.filename) safeSetItem(ACTIVE_DIAGRAM_FILENAME_STORAGE_KEY, active.filename);
}

export function loadDiagramTrash(): TrashedDiagram[] {
  const parsed = readJson<unknown>(TRASHED_DIAGRAMS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed.filter(isTrashedDiagram) : [];
}

export function writeDiagramTrash(diagrams: TrashedDiagram[]): void {
  writeJson(TRASHED_DIAGRAMS_STORAGE_KEY, diagrams.slice(0, 40));
}

export function normalizeDiagramName(value: string): string { return value.trim() || "Diagrama sem nome"; }
export function nextDiagramName(diagrams: SavedDiagram[]): string { return nextNamedDiagramName(diagrams, "Diagrama"); }
export function nextNamedDiagramName(diagrams: SavedDiagram[], prefix: string): string {
  let index = diagrams.length + 1;
  const names = new Set(diagrams.map((item) => item.name));
  while (names.has(`${prefix} ${index}`)) index += 1;
  return `${prefix} ${index}`;
}
export function createBlankDiagramDbml(): string {
  return `// @diagram\n// background=${defaultDiagramVisual.backgroundColor}\n// gridColor=${defaultDiagramVisual.gridColor}\n// gridSize=${defaultDiagramVisual.gridSize}\n`;
}
export function currentDbmlFilename(diagrams: SavedDiagram[], activeId: string, name: string): string {
  return diagrams.find((item) => item.id === activeId)?.filename ?? dbmlFilename(name);
}
export function dbmlFilename(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "diagram";
  return `${cleaned}.dbml`;
}
export function migrateDarkOnlyDbml(dbml: string): string {
  return dbml.replace(/\/\/ background=#f8fafc/g, "// background=#0f172a")
    .replace(/\/\/ gridColor=#d7dee8/g, "// gridColor=#1f2a3a").replace(/\/\/ background=#ffffff/g, "// background=#111827")
    .replace(/\/\/ header=#dbeafe/g, "// header=#1e3a5f").replace(/\/\/ header=#e0f2fe/g, "// header=#253142")
    .replace(/\/\/ header=#ccfbf1/g, "// header=#12312e").replace(/\/\/ text=#111827/g, "// text=#e5edf7")
    .replace(/\/\/ text=#172033/g, "// text=#e5edf7");
}

function readStoredDiagrams(): SavedDiagram[] {
  const parsed = readJson<unknown>(DIAGRAMS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isStoredDiagram).map((item) => ({ ...item, name: normalizeDiagramName(item.name), dbml: migrateDarkOnlyDbml(item.dbml), filename: item.filename ?? dbmlFilename(item.name) }));
}
function isStoredDiagram(value: unknown): value is SavedDiagram {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedDiagram>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.dbml === "string" &&
    (item.wiki === undefined || typeof item.wiki === "string") &&
    (item.wikiDocument === undefined || typeof item.wikiDocument === "string") && typeof item.updatedAt === "number";
}

function isTrashedDiagram(value: unknown): value is TrashedDiagram {
  return isStoredDiagram(value) && typeof (value as Partial<TrashedDiagram>).trashedAt === "number";
}
