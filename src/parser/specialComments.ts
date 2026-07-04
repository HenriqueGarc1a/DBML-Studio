import type {
  DiagramVisual,
  Direction,
  Cardinality,
  GroupModel,
  LineRoute,
  LineStyle,
  Point,
  RelationModel,
  TableModel,
} from "../model/types";
import {
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
  tableProps: Map<string, Partial<TableModel>>;
  lineProps: Array<Partial<RelationModel>>;
  groups: GroupModel[];
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

  const tableProps = new Map<string, Partial<TableModel>>();
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
    },
  };
}

function tableBlockToTableProps(block: CommentBlock): Partial<TableModel> {
  const props = block.props;
  return {
    x: numberOr(props.x, 0),
    y: numberOr(props.y, 0),
    width: numberOr(props.width, 0),
    height: numberOr(props.height, 0),
    layoutSource: "comment",
    visual: {
      backgroundColor: normalizeHex(props.background, defaultTableVisual.backgroundColor),
      borderColor: normalizeHex(props.border, defaultTableVisual.borderColor),
      headerColor: normalizeHex(props.header, defaultTableVisual.headerColor),
      textColor: normalizeHex(props.text, defaultTableVisual.textColor),
      opacity: clamp(numberOr(props.opacity, defaultTableVisual.opacity), 0, 1),
    },
  };
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
