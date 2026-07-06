export type Direction = "north" | "south" | "east" | "west";

export type LineRoute = "orthogonal";

export type LineStyle = "solid" | "dashed" | "dotted";

export type Cardinality = "one" | "many";

export type LayoutSource = "auto" | "comment" | "manual";

export type DiagramElementType = "table" | "relation" | "group";

export interface Point {
  x: number;
  y: number;
}

export interface Selection {
  type: DiagramElementType;
  id: string;
}

export interface TableVisual {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  headerColor: string;
  lineColor: string;
  opacity: number;
}

export type BadgeKind = "primaryKey" | "foreignKey" | "notNull" | "unique";

export interface BadgeVisual {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

export type BadgeVisualSet = Record<BadgeKind, BadgeVisual>;

export interface SavedColor {
  name: string;
  color: string;
}

export interface DiagramVisual {
  backgroundColor: string;
  gridColor: string;
  gridSize: number;
  defaultTable: TableVisual;
  badges: BadgeVisualSet;
  savedColors: SavedColor[];
}

export interface ColumnModel {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey: boolean;
  unique?: boolean;
  defaultValue?: string;
  note?: string;
  rawSettings: string[];
}

export interface TableIndexModel {
  columns: string[];
  unique?: boolean;
  primary?: boolean;
  raw: string;
}

export interface TableModel {
  id: string;
  name: string;
  columns: ColumnModel[];
  x: number;
  y: number;
  width: number;
  height: number;
  visual: TableVisual;
  usesDefaultStyle: boolean;
  usesGroupStyle: boolean;
  indexes: TableIndexModel[];
  note?: string;
  layoutSource: LayoutSource;
}

export interface EnumModel {
  id: string;
  name: string;
  values: string[];
}

export interface RelationModel {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  fromSide: Direction;
  toSide: Direction;
  route: LineRoute;
  viaPoints: Point[];
  color: string;
  usesTableLineColor: boolean;
  opacity: number;
  strokeWidth: number;
  style: LineStyle;
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
  label: string;
}

export interface GroupModel {
  id: string;
  label: string;
  labelX: number;
  labelY: number;
  textColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  borderColor: string;
  opacity: number;
  tableVisual: TableVisual;
  tables: string[];
}

export interface DiagramModel {
  id: string;
  visual: DiagramVisual;
  tables: TableModel[];
  relations: RelationModel[];
  groups: GroupModel[];
  enums: EnumModel[];
  source: string;
}
