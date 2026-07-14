import { readJson, writeJson } from "../utils/storage";

export type SnapshotReason = "manual" | "automatic" | "before-restore";

export interface DiagramSnapshot {
  id: string;
  diagramId: string;
  name: string;
  dbml: string;
  uiLayout: string;
  createdAt: number;
  reason: SnapshotReason;
}

const SNAPSHOTS_STORAGE_KEY = "dbml-studio-diagram-snapshots";
const MAX_PER_DIAGRAM = 20;
const MAX_TOTAL = 100;

export function loadDiagramSnapshots(): DiagramSnapshot[] {
  const value = readJson<unknown>(SNAPSHOTS_STORAGE_KEY, []);
  return Array.isArray(value) ? value.filter(isDiagramSnapshot).sort((a, b) => b.createdAt - a.createdAt) : [];
}

export function addDiagramSnapshot(current: DiagramSnapshot[], snapshot: DiagramSnapshot): DiagramSnapshot[] {
  const duplicate = current.find((item) => item.diagramId === snapshot.diagramId && item.dbml === snapshot.dbml && item.uiLayout === snapshot.uiLayout);
  if (duplicate) return current;
  const others = current.filter((item) => item.diagramId !== snapshot.diagramId);
  const sameDiagram = [snapshot, ...current.filter((item) => item.diagramId === snapshot.diagramId)].slice(0, MAX_PER_DIAGRAM);
  return [...sameDiagram, ...others].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TOTAL);
}

export function writeDiagramSnapshots(snapshots: DiagramSnapshot[]): boolean {
  return writeJson(SNAPSHOTS_STORAGE_KEY, snapshots);
}

function isDiagramSnapshot(value: unknown): value is DiagramSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DiagramSnapshot>;
  return typeof item.id === "string" && typeof item.diagramId === "string" && typeof item.name === "string" &&
    typeof item.dbml === "string" && typeof item.uiLayout === "string" && typeof item.createdAt === "number" &&
    (item.reason === "manual" || item.reason === "automatic" || item.reason === "before-restore");
}
