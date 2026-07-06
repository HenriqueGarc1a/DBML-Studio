import { describe, expect, it } from "vitest";
import {
  defaultGroupTableVisual,
  defaultRelationVisual,
  defaultTableVisual,
} from "./defaults";
import type { GroupModel, RelationModel, TableModel, TableVisual } from "./types";
import {
  getEffectiveTableVisual,
  getGroupForTable,
  getRelationColor,
  getRelationFlowColor,
} from "./visualSelectors";

describe("visual selectors", () => {
  it("uses the topmost containing group when table group style is enabled", () => {
    const table = makeTable({ usesGroupStyle: true, x: 20, y: 20 });
    const firstGroup = makeGroup("first", { lineColor: "#111111" });
    const topGroup = makeGroup("top", { lineColor: "#222222" });

    expect(getGroupForTable(table, [firstGroup, topGroup])?.id).toBe("top");
    expect(getEffectiveTableVisual(table, defaultTableVisual, [firstGroup, topGroup]).lineColor).toBe("#222222");
  });

  it("uses source table line color for relations in table color mode", () => {
    const source = makeTable({ id: "project", usesGroupStyle: true });
    const target = makeTable({ id: "user" });
    const group = makeGroup("backend", { lineColor: "#14b8a6", headerColor: "#115e59" });
    const relation = makeRelation({ fromTable: "project", toTable: "user", usesTableLineColor: true });

    expect(getRelationColor(relation, [source, target], defaultTableVisual, [group])).toBe("#14b8a6");
    expect(getRelationFlowColor(relation, [source, target], defaultTableVisual, [group])).toBe("#115e59");
  });

  it("uses explicit relation color when table color mode is disabled", () => {
    const relation = makeRelation({ color: "#dc2626", usesTableLineColor: false });

    expect(getRelationColor(relation, [], defaultTableVisual)).toBe("#dc2626");
  });
});

function makeTable(patch: Partial<TableModel> = {}): TableModel {
  return {
    id: "table",
    name: "table",
    columns: [],
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    visual: { ...defaultTableVisual, lineColor: "#64748b", headerColor: "#253142" },
    usesDefaultStyle: true,
    usesGroupStyle: false,
    indexes: [],
    layoutSource: "manual",
    ...patch,
  };
}

function makeGroup(id: string, tableVisual: Partial<TableVisual> = {}): GroupModel {
  return {
    id,
    label: id,
    labelX: 12,
    labelY: 24,
    textColor: "#0f766e",
    x: -10,
    y: -10,
    width: 400,
    height: 300,
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
    opacity: 0.12,
    tableVisual: {
      ...defaultGroupTableVisual,
      ...tableVisual,
    },
    tables: [],
  };
}

function makeRelation(patch: Partial<RelationModel> = {}): RelationModel {
  return {
    id: "relation",
    fromTable: "source",
    fromColumn: "source_id",
    toTable: "target",
    toColumn: "id",
    ...defaultRelationVisual,
    ...patch,
  };
}
