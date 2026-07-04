import type { DiagramModel, GroupModel, RelationModel, TableModel, TableVisual } from "../model/types";
import { hexToRgb } from "../utils/color";
import { getRelationGeometry } from "../utils/geometry";

export function exportTikz(diagram: DiagramModel): string {
  const tableMap = new Map(diagram.tables.map((table) => [table.id, table]));
  const groups = diagram.groups.map(exportGroup).join("\n\n");
  const tables = diagram.tables
    .map((table) => exportTable(table, diagram.visual.defaultTable, getTableGroupVisual(table, diagram.groups)))
    .join("\n\n");
  const relations = diagram.relations
    .map((relation) => {
      const fromTable = tableMap.get(relation.fromTable);
      const toTable = tableMap.get(relation.toTable);
      return fromTable && toTable ? exportRelation(relation, fromTable, toTable) : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    "\\documentclass[tikz,border=10pt]{standalone}",
    "\\usepackage{xcolor}",
    "\\usetikzlibrary{arrows.meta,positioning,shapes.multipart}",
    "\\begin{document}",
    "\\begin{tikzpicture}[x=1pt,y=-1pt,>=Stealth]",
    groups,
    tables,
    relations,
    "\\end{tikzpicture}",
    "\\end{document}",
    "",
  ]
    .filter((section) => section !== "")
    .join("\n");
}

function exportGroup(group: GroupModel): string {
  return [
    `\\filldraw[fill=${tikzColor(group.backgroundColor)}, fill opacity=${round(
      group.opacity,
      2,
    )}, draw=${tikzColor(group.borderColor)}]`,
    `(${round(group.x)},${round(group.y)}) rectangle (${round(group.x + group.width)},${round(
      group.y + group.height,
    )});`,
    `\\node[anchor=north west, text=${tikzColor(group.borderColor)}] at (${round(
      group.x + 12,
    )},${round(group.y + 12)}) {${escapeLatex(group.label)}};`,
  ].join("\n");
}

function exportTable(table: TableModel, defaultVisual: TableModel["visual"], groupVisual?: TableVisual): string {
  const visual = groupVisual ?? (table.usesDefaultStyle ? defaultVisual : table.visual);
  const rows = [
    `\\textbf{${escapeLatex(table.name)}}`,
    ...table.columns.map((column) => {
      const tags = [
        column.primaryKey ? "PK" : "",
        column.foreignKey ? "FK" : "",
        !column.nullable ? "NN" : "",
        column.unique ? "UQ" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const suffix = tags ? `\\hfill {\\scriptsize ${tags}}` : "";
      return `${escapeLatex(column.name)} : ${escapeLatex(column.type)} ${suffix}`;
    }),
  ].join("\\\\");

  return [
    `\\node[draw=${tikzColor(visual.borderColor)}, fill=${tikzColor(
      visual.backgroundColor,
    )}, text=${tikzColor(visual.textColor)}, fill opacity=${round(
      visual.opacity,
      2,
    )}, text opacity=1, anchor=north west, minimum width=${round(
      table.width,
    )}pt, align=left, inner sep=6pt] (${nodeId(table.id)}) at (${round(table.x)},${round(
      table.y,
    )}) {\\begin{minipage}{${round(table.width - 18)}pt}${rows}\\end{minipage}};`,
  ].join("\n");
}

function getTableGroupVisual(table: TableModel, groups: GroupModel[]): TableVisual | undefined {
  if (!table.usesGroupStyle) return undefined;
  const center = {
    x: table.x + table.width / 2,
    y: table.y + table.height / 2,
  };

  return [...groups].reverse().find((group) =>
    center.x >= group.x &&
    center.x <= group.x + group.width &&
    center.y >= group.y &&
    center.y <= group.y + group.height,
  )?.tableVisual;
}

function exportRelation(relation: RelationModel, fromTable: TableModel, toTable: TableModel): string {
  const geometry = getRelationGeometry(relation, fromTable, toTable);
  const dash = relation.style === "dashed" ? "dashed" : relation.style === "dotted" ? "dotted" : "solid";
  const path = geometry.points
    .map((point, index) => `${index === 0 ? "" : " -- "}(${round(point.x)},${round(point.y)})`)
    .join("");
  const label = relation.label
    ? ` node[midway, fill=white, inner sep=2pt] {${escapeLatex(relation.label)}}`
    : "";

  return `\\draw[${dash}, line width=${round(
    relation.strokeWidth,
  2,
)}pt, draw=${tikzColor(relation.color)}, opacity=${round(relation.opacity, 2)}] ${path}${label};`;
}

function tikzColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function nodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function round(value: number, digits = 1): string {
  return Number(value.toFixed(digits)).toString();
}
