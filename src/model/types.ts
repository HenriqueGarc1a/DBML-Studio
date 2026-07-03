export type Direction = "north" | "south" | "east" | "west";

export type LineRoute = "straight" | "orthogonal" | "curve";

export type LineStyle = "solid" | "dashed" | "dotted" | "rounded";

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
  opacity: number;
}

export interface DiagramVisual {
  backgroundColor: string;
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
  startOffsetX: number;
  startOffsetY: number;
  endOffsetX: number;
  endOffsetY: number;
  route: LineRoute;
  viaPoints: Point[];
  color: string;
  opacity: number;
  strokeWidth: number;
  style: LineStyle;
  arrowColor: string;
  fromCardinality: Cardinality;
  toCardinality: Cardinality;
  label: string;
}

export interface GroupModel {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  borderColor: string;
  opacity: number;
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
