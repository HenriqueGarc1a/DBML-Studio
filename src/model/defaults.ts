import type { BadgeVisualSet, DiagramVisual, GroupModel, RelationModel, TableVisual } from "./types";

export const TABLE_HEADER_HEIGHT = 38;
export const TABLE_ROW_HEIGHT = 28;
export const TABLE_MIN_HEIGHT = 80;
export const TABLE_MIN_WIDTH = 220;
export const TABLE_PADDING_X = 18;
export const GROUP_MIN_WIDTH = 120;
export const GROUP_MIN_HEIGHT = 90;
export const DIAGRAM_DEFAULT_GRID_SIZE = 4;
export const DIAGRAM_MIN_GRID_SIZE = 2;
export const DIAGRAM_MAX_GRID_SIZE = 128;

export function getTableMinHeight(columnCount: number): number {
  return TABLE_HEADER_HEIGHT + columnCount * TABLE_ROW_HEIGHT;
}

export function normalizeGridSize(value: unknown, fallback = DIAGRAM_DEFAULT_GRID_SIZE): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(DIAGRAM_MAX_GRID_SIZE, Math.max(DIAGRAM_MIN_GRID_SIZE, Math.round(next)));
}

export const defaultTableVisual: TableVisual = {
  backgroundColor: "#111827",
  borderColor: "#4b5f78",
  textColor: "#e5edf7",
  headerColor: "#253142",
  opacity: 1,
};

export const defaultGroupTableVisual: TableVisual = {
  backgroundColor: "#10231f",
  borderColor: "#2dd4bf",
  textColor: "#dffcf7",
  headerColor: "#134e4a",
  opacity: 1,
};

export const defaultBadgeVisuals: BadgeVisualSet = {
  primaryKey: {
    backgroundColor: "#3f2d12",
    borderColor: "#f59e0b",
    textColor: "#fcd34d",
  },
  foreignKey: {
    backgroundColor: "#12312e",
    borderColor: "#2dd4bf",
    textColor: "#99f6e4",
  },
  notNull: {
    backgroundColor: "#3b1620",
    borderColor: "#fb7185",
    textColor: "#fecdd3",
  },
  unique: {
    backgroundColor: "#1e1b4b",
    borderColor: "#818cf8",
    textColor: "#c7d2fe",
  },
};

export const defaultDiagramVisual: DiagramVisual = {
  backgroundColor: "#0f172a",
  gridColor: "#1f2a3a",
  gridSize: DIAGRAM_DEFAULT_GRID_SIZE,
  defaultTable: { ...defaultTableVisual },
  badges: {
    primaryKey: { ...defaultBadgeVisuals.primaryKey },
    foreignKey: { ...defaultBadgeVisuals.foreignKey },
    notNull: { ...defaultBadgeVisuals.notNull },
    unique: { ...defaultBadgeVisuals.unique },
  },
  savedColors: [],
};

export const defaultRelationVisual: Pick<
  RelationModel,
  | "fromSide"
  | "toSide"
  | "startOffsetX"
  | "startOffsetY"
  | "endOffsetX"
  | "endOffsetY"
  | "route"
  | "viaPoints"
  | "color"
  | "opacity"
  | "strokeWidth"
  | "style"
  | "arrowColor"
  | "fromCardinality"
  | "toCardinality"
  | "label"
> = {
  fromSide: "east",
  toSide: "west",
  startOffsetX: 0,
  startOffsetY: 0,
  endOffsetX: 0,
  endOffsetY: 0,
  route: "orthogonal",
  viaPoints: [],
  color: "#94a3b8",
  opacity: 0.9,
  strokeWidth: 2,
  style: "solid",
  arrowColor: "#94a3b8",
  fromCardinality: "many",
  toCardinality: "one",
  label: "",
};

export const defaultGroupVisual: Omit<
  GroupModel,
  "id" | "label" | "x" | "y" | "width" | "height" | "tables"
> = {
  backgroundColor: "#0f766e",
  borderColor: "#0f766e",
  opacity: 0.12,
  tableVisual: { ...defaultGroupTableVisual },
};
