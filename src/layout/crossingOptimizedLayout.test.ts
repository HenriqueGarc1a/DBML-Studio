import { describe, expect, it } from "vitest";
import { defaultDiagramVisual, defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { DiagramModel, RelationModel, TableModel } from "../model/types";
import { countRelationCrossings, optimizeVisualColumnOrder } from "./crossingOptimizedLayout";

describe("crossing optimized layout", () => {
  it("counts proper crossings between different relations", () => {
    const tables = [
      table("left", 0, 80), table("right", 600, 80),
      table("top", 300, -180), table("bottom", 300, 360),
    ];
    const diagram: DiagramModel = {
      id: "diagram", source: "", tables, groups: [], enums: [],
      visual: { ...defaultDiagramVisual },
      relations: [relation("horizontal", "left", "right"), relation("vertical", "top", "bottom")],
    };
    expect(countRelationCrossings(diagram)).toBeGreaterThan(0);
  });

  it("changes only UI column order and keeps the primary key first", () => {
    const owner = table("owner", 0, 400);
    const item = table("item", 400, 0);
    item.columns = [
      { ...item.columns[0], name: "name", primaryKey: false },
      { ...item.columns[0], id: "owner_id", name: "owner_id", primaryKey: false },
      { ...item.columns[0], id: "pk", name: "id", primaryKey: true },
    ];
    const diagram: DiagramModel = {
      id: "diagram", source: "", tables: [owner, item], groups: [], enums: [], visual: { ...defaultDiagramVisual },
      relations: [{ ...relation("owner-link", "item", "owner"), fromColumn: "owner_id" }],
    };
    const optimized = optimizeVisualColumnOrder(diagram);
    expect(optimized.tables[1].columnOrder?.[0]).toBe("id");
    expect(optimized.tables[1].columns.map((column) => column.name)).toEqual(["name", "owner_id", "id"]);
  });
});

function table(id: string, x: number, y: number): TableModel {
  return {
    id, name: id, x, y, width: 220, height: 100, columns: [{
      id: `${id}-id`, name: "id", type: "int", nullable: false,
      primaryKey: true, foreignKey: false, rawSettings: [],
    }], visual: defaultTableVisual, usesDefaultStyle: true, usesGroupStyle: false,
    indexes: [], layoutSource: "manual",
  };
}

function relation(id: string, fromTable: string, toTable: string): RelationModel {
  return {
    id, fromTable, fromColumn: "id", toTable, toColumn: "id",
    ...defaultRelationVisual, fromSide: "east", toSide: "west",
  };
}
