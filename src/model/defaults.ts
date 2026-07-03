import type { DiagramVisual, GroupModel, RelationModel, TableVisual } from "./types";

export const TABLE_HEADER_HEIGHT = 38;
export const TABLE_ROW_HEIGHT = 28;
export const TABLE_MIN_HEIGHT = 80;
export const TABLE_MIN_WIDTH = 220;
export const TABLE_PADDING_X = 18;

export function getTableMinHeight(columnCount: number): number {
  return Math.max(TABLE_MIN_HEIGHT, TABLE_HEADER_HEIGHT + columnCount * TABLE_ROW_HEIGHT);
}

export const defaultTableVisual: TableVisual = {
  backgroundColor: "#ffffff",
  borderColor: "#64748b",
  textColor: "#172033",
  headerColor: "#dbeafe",
  opacity: 1,
};

export const defaultDiagramVisual: DiagramVisual = {
  backgroundColor: "#f8fafc",
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
  color: "#475569",
  opacity: 0.9,
  strokeWidth: 2,
  style: "solid",
  arrowColor: "#475569",
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
};
