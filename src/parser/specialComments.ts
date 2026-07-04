import type {
  BadgeVisual,
  DiagramVisual,
  Direction,
  Cardinality,
  GroupModel,
  LineRoute,
  LineStyle,
  Point,
  RelationModel,
  SavedColor,
  TableModel,
  TableVisual,
} from "../model/types";
import {
  defaultBadgeVisuals,
  defaultDiagramVisual,
  defaultGroupVisual,
  defaultRelationVisual,
  defaultTableVisual,
  normalizeGridSize,
} from "../model/defaults";
import { clamp, normalizeHex, numberOr } from "../utils/color";
import { makeId, slugify } from "../utils/id";

export interface SpecialLayout {
  diagramProps: {
    visual?: Partial<DiagramVisual>;
  };
  tableProps: Map<string, TableSpecialProps>;
  lineProps: Array<Partial<RelationModel>>;
  groups: GroupModel[];
}

export interface TableSpecialProps extends Partial<Omit<TableModel, "visual">> {
  visual?: Partial<TableVisual>;
}

interface CommentBlock {
  kind: "diagram" | "table" | "line" | "group";
  key: string;
  props: Record<string, string>;
}

export function parseSpecialComments(source: string): SpecialLayout {
  const blocks: CommentBlock[] = [];
  let current: CommentBlock | undefined;

  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^\s*\/\/\s*@(diagram|table|line|group)\b\s*(.*?)\s*$/);
    if (marker) {
      current = {
        kind: marker[1] as CommentBlock["kind"],
        key: marker[2].trim(),
        props: {},
      };
      blocks.push(current);
      continue;
    }

    const prop = line.match(/^\s*\/\/\s*([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (current && prop) {
      current.props[prop[1]] = prop[2].trim();
      continue;
    }

    if (line.trim() && !line.trim().startsWith("//")) {
      current = undefined;
    }
  }

  const tableProps = new Map<string, TableSpecialProps>();
  const lineProps: Array<Partial<RelationModel>> = [];
  const groups: GroupModel[] = [];
  const diagramProps: SpecialLayout["diagramProps"] = {};

  for (const block of blocks) {
    if (block.kind === "diagram") {
      Object.assign(diagramProps, blockToDiagramProps(block));
    }

    if (block.kind === "table") {
      tableProps.set(block.key, tableBlockToTableProps(block));
    }

    if (block.kind === "line") {
      lineProps.push(blockToLineProps(block));
    }

    if (block.kind === "group") {
      groups.push(blockToGroup(block));
    }
  }

  return { diagramProps, tableProps, lineProps, groups };
}

function blockToDiagramProps(block: CommentBlock): SpecialLayout["diagramProps"] {
  const props = block.props;

  return {
    visual: {
      backgroundColor: normalizeHex(props.background, defaultDiagramVisual.backgroundColor),
      gridColor: normalizeHex(props.gridColor, defaultDiagramVisual.gridColor),
      gridSize: normalizeGridSize(props.gridSize, defaultDiagramVisual.gridSize),
      defaultTable: {
        backgroundColor: normalizeHex(props.tableBackground, defaultTableVisual.backgroundColor),
        borderColor: normalizeHex(props.tableBorder, defaultTableVisual.borderColor),
        headerColor: normalizeHex(props.tableHeader, defaultTableVisual.headerColor),
        textColor: normalizeHex(props.tableText, defaultTableVisual.textColor),
        opacity: clamp(numberOr(props.tableOpacity, defaultTableVisual.opacity), 0, 1),
      },
      badges: {
        primaryKey: readBadgeVisual(props, "pk", defaultBadgeVisuals.primaryKey),
        foreignKey: readBadgeVisual(props, "fk", defaultBadgeVisuals.foreignKey),
        notNull: readBadgeVisual(props, "notNull", defaultBadgeVisuals.notNull),
        unique: readBadgeVisual(props, "unique", defaultBadgeVisuals.unique),
      },
      savedColors: parseSavedColors(props.savedColors),
    },
  };
}

function tableBlockToTableProps(block: CommentBlock): TableSpecialProps {
  const props = block.props;
  const visual: Partial<TableVisual> = {};
  const result: TableSpecialProps = {
    layoutSource: "comment",
  };

  if ("x" in props) result.x = numberOr(props.x, 0);
  if ("y" in props) result.y = numberOr(props.y, 0);
  if ("width" in props) result.width = numberOr(props.width, 0);
  if ("height" in props) result.height = numberOr(props.height, 0);
  if ("background" in props) visual.backgroundColor = normalizeHex(props.background, defaultTableVisual.backgroundColor);
  if ("border" in props) visual.borderColor = normalizeHex(props.border, defaultTableVisual.borderColor);
  if ("header" in props) visual.headerColor = normalizeHex(props.header, defaultTableVisual.headerColor);
  if ("text" in props) visual.textColor = normalizeHex(props.text, defaultTableVisual.textColor);
  if ("opacity" in props) visual.opacity = clamp(numberOr(props.opacity, defaultTableVisual.opacity), 0, 1);

  const hasOwnVisual = Object.keys(visual).length > 0;
  result.usesDefaultStyle = parseBoolean(props.useDefaultStyle, !hasOwnVisual);
  if (hasOwnVisual) result.visual = visual;

  return result;
}

function blockToLineProps(block: CommentBlock): Partial<RelationModel> {
  const props = block.props;
  const color = normalizeHex(props.color, defaultRelationVisual.color);

  return {
    color,
    arrowColor: normalizeHex(props.arrowColor, color),
    fromCardinality: parseCardinality(props.fromCardinality, defaultRelationVisual.fromCardinality),
    toCardinality: parseCardinality(props.toCardinality, defaultRelationVisual.toCardinality),
    strokeWidth: numberOr(props.strokeWidth, defaultRelationVisual.strokeWidth),
    opacity: clamp(numberOr(props.opacity, defaultRelationVisual.opacity), 0, 1),
    style: parseLineStyle(props.style, defaultRelationVisual.style),
    route: parseLineRoute(props.route, defaultRelationVisual.route),
    fromSide: parseDirection(props.from, defaultRelationVisual.fromSide),
    toSide: parseDirection(props.to, defaultRelationVisual.toSide),
    startOffsetX: numberOr(props.startOffsetX, defaultRelationVisual.startOffsetX),
    startOffsetY: numberOr(props.startOffsetY, defaultRelationVisual.startOffsetY),
    endOffsetX: numberOr(props.endOffsetX, defaultRelationVisual.endOffsetX),
    endOffsetY: numberOr(props.endOffsetY, defaultRelationVisual.endOffsetY),
    label: props.label ?? defaultRelationVisual.label,
    viaPoints: parseViaPoints(props.via),
  };
}

function blockToGroup(block: CommentBlock): GroupModel {
  const props = block.props;
  const label = props.label || block.key || "Group";
  const id = makeId("group", block.key || label);

  return {
    id,
    label,
    x: numberOr(props.x, -40),
    y: numberOr(props.y, -40),
    width: numberOr(props.width, 640),
    height: numberOr(props.height, 360),
    backgroundColor: normalizeHex(props.background, defaultGroupVisual.backgroundColor),
    borderColor: normalizeHex(props.border, defaultGroupVisual.borderColor),
    opacity: clamp(numberOr(props.opacity, defaultGroupVisual.opacity), 0, 1),
    tables: (props.tables || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(slugify),
  };
}

function parseViaPoints(value: string | undefined): Point[] {
  if (!value) return [];
  const points: Point[] = [];
  const matcher = /\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value))) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
  }

  return points;
}

function readBadgeVisual(
  props: Record<string, string>,
  prefix: "pk" | "fk" | "notNull" | "unique",
  fallback: BadgeVisual,
): BadgeVisual {
  return {
    backgroundColor: normalizeHex(props[`${prefix}BadgeBackground`], fallback.backgroundColor),
    borderColor: normalizeHex(props[`${prefix}BadgeBorder`], fallback.borderColor),
    textColor: normalizeHex(props[`${prefix}BadgeText`], fallback.textColor),
  };
}

function parseSavedColors(value: string | undefined): SavedColor[] {
  if (!value) return [];
  const colors: SavedColor[] = [];
  const seen = new Set<string>();

  for (const [index, item] of value.split(",").entries()) {
    const [rawName, rawColor] = item.includes(":")
      ? item.split(/:(.+)/)
      : [`Cor ${index + 1}`, item];
    const color = normalizeHex(rawColor, "");
    if (!color || seen.has(color.toLowerCase())) continue;
    seen.add(color.toLowerCase());
    colors.push({
      name: decodeSavedColorName(rawName) || `Cor ${index + 1}`,
      color,
    });
  }

  return colors;
}

function decodeSavedColorName(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function parseDirection(value: string | undefined, fallback: Direction): Direction {
  return value === "north" || value === "south" || value === "east" || value === "west"
    ? value
    : fallback;
}

function parseLineRoute(value: string | undefined, fallback: LineRoute): LineRoute {
  return value === "straight" || value === "orthogonal" || value === "curve" ? value : fallback;
}

function parseLineStyle(value: string | undefined, fallback: LineStyle): LineStyle {
  return value === "solid" || value === "dashed" || value === "dotted" || value === "rounded"
    ? value
    : fallback;
}

function parseCardinality(value: string | undefined, fallback: Cardinality): Cardinality {
  return value === "one" || value === "many" ? value : fallback;
}
