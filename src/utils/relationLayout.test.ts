import { describe, expect, it } from "vitest";
import type { RelationModel, TableModel } from "../model/types";
import { defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import { distributeRelationEndpoints } from "./relationLayout";

const table: TableModel = {
  id: "project",
  name: "project",
  columns: [
    {
      id: "column-project-user-id-0",
      name: "user_id",
      type: "int",
      nullable: false,
      primaryKey: false,
      foreignKey: true,
      rawSettings: [],
    },
  ],
  x: 100,
  y: 100,
  width: 220,
  height: 120,
  visual: defaultTableVisual,
  indexes: [],
  layoutSource: "manual",
};

function relation(id: string, startOffsetY = 0): RelationModel {
  return {
    id,
    fromTable: "project",
    fromColumn: "user_id",
    toTable: "user",
    toColumn: "id",
    ...defaultRelationVisual,
    startOffsetY,
  };
}

describe("relation endpoint layout", () => {
  it("spreads automatic endpoints that share the same table side and column", () => {
    const relations = [relation("a"), relation("b"), relation("c")];
    const adjusted = distributeRelationEndpoints(relations, new Map([["project", table]]));

    expect(adjusted.get("a")?.startOffsetY).toBe(-14);
    expect(adjusted.get("b")?.startOffsetY).toBe(0);
    expect(adjusted.get("c")?.startOffsetY).toBe(14);
  });

  it("keeps manually adjusted endpoints untouched", () => {
    const adjusted = distributeRelationEndpoints(
      [relation("a"), relation("b", 20)],
      new Map([["project", table]]),
    );

    expect(adjusted.get("a")?.startOffsetY).toBe(0);
    expect(adjusted.get("b")?.startOffsetY).toBe(20);
  });
});
