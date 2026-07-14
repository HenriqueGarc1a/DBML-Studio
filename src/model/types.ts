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
  tableRouteMargin: number;
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
  name?: string;
  type?: string;
  settings?: string[];
  raw: string;
}

export interface TableCheckModel {
  expression: string;
  name?: string;
  settings?: string[];
  raw: string;
}

export interface TableModel {
  id: string;
  name: string;
  alias?: string;
  headerSettings?: string[];
  columns: ColumnModel[];
  columnOrder?: string[];
  partials?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  visual: TableVisual;
  usesDefaultStyle: boolean;
  usesGroupStyle: boolean;
  indexes: TableIndexModel[];
  checks?: TableCheckModel[];
  preservedBlocks?: string[];
  note?: string;
  layoutSource: LayoutSource;
}

export interface EnumModel {
  id: string;
  name: string;
  values: string[];
  valueSettings?: Record<string, string[]>;
  note?: string;
}

export interface RelationModel {
  id: string;
  dbmlName?: string;
  dbmlOperator?: ">" | "<" | "-" | "<>";
  dbmlSettings?: string[];
  fromTable: string;
  fromColumn: string;
  fromColumns?: string[];
  toTable: string;
  toColumn: string;
  toColumns?: string[];
  fromSide: Direction;
  toSide: Direction;
  sideMode?: "auto" | "manual";
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

export type DbmlAdvancedBlockKind = "Project" | "TableGroup" | "TablePartial" | "Unknown";

export interface DbmlAdvancedBlock {
  kind: DbmlAdvancedBlockKind;
  name: string;
  raw: string;
  tables?: string[];
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
  advancedBlocks?: DbmlAdvancedBlock[];
  preservedStatements?: string[];
  dbmlWarnings?: string[];
  source: string;
}
