import ELK from "elkjs/lib/elk.bundled.js";
import {
  TABLE_MIN_WIDTH,
  TABLE_PADDING_X,
  getTableMinHeight,
} from "../model/defaults";
import type { DiagramModel, TableModel } from "../model/types";

interface LayoutOptions {
  preserveManual?: boolean;
}

const elk = new ELK();

export async function layoutDiagram(
  diagram: DiagramModel,
  options: LayoutOptions = { preserveManual: true },
): Promise<DiagramModel> {
  const measuredTables = diagram.tables.map(measureTable);
  const shouldPreserve = options.preserveManual !== false;
  const allHaveManualPositions = measuredTables.every((table) => table.layoutSource !== "auto");

  if (shouldPreserve && allHaveManualPositions) {
    return { ...diagram, tables: measuredTables };
  }

  try {
    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "70",
        "elk.layered.spacing.nodeNodeBetweenLayers": "110",
      },
      children: measuredTables.map((table) => ({
        id: table.id,
        width: table.width,
        height: table.height,
      })),
      edges: diagram.relations.map((relation) => ({
        id: relation.id,
        sources: [relation.fromTable],
        targets: [relation.toTable],
      })),
    };

    const result = await elk.layout(graph);
    const positions = new Map<string, { x: number; y: number }>();

    for (const child of result.children ?? []) {
      positions.set(child.id, {
        x: Number(child.x ?? 0),
        y: Number(child.y ?? 0),
      });
    }

    return {
      ...diagram,
      tables: measuredTables.map((table) => {
        if (shouldPreserve && table.layoutSource !== "auto") return table;
        const next = positions.get(table.id);
        return next
          ? { ...table, x: next.x, y: next.y, layoutSource: "auto" }
          : table;
      }),
    };
  } catch (error) {
    console.warn("ELK layout failed, using grid fallback.", error);
    return { ...diagram, tables: fallbackLayout(measuredTables) };
  }
}

export function measureTable(table: TableModel): TableModel {
  const longestColumn = table.columns.reduce((max, column) => {
    return Math.max(max, `${column.name} ${column.type}`.length);
  }, table.name.length);

  return {
    ...table,
    width: Math.max(table.width || 0, TABLE_MIN_WIDTH, longestColumn * 8 + TABLE_PADDING_X * 2 + 70),
    height: getTableMinHeight(table.columns.length),
  };
}

function fallbackLayout(tables: TableModel[]): TableModel[] {
  return tables.map((table, index) => ({
    ...table,
    x: 80 + (index % 3) * 320,
    y: 80 + Math.floor(index / 3) * 260,
    layoutSource: table.layoutSource === "manual" ? "manual" : "auto",
  }));
}
