import { describe, expect, it } from "vitest";
import type { TableModel } from "../model/types";
import { snapRelationEndpoint } from "./geometry";

const table: TableModel = {
  id: "user",
  name: "user",
  columns: [
    {
      id: "column-user-id-0",
      name: "id",
      type: "int",
      nullable: false,
      primaryKey: true,
      foreignKey: false,
      rawSettings: [],
    },
  ],
  x: 100,
  y: 80,
  width: 240,
  height: 160,
  visual: {
    backgroundColor: "#ffffff",
    borderColor: "#64748b",
    textColor: "#172033",
    headerColor: "#dbeafe",
    opacity: 1,
  },
  usesDefaultStyle: false,
  indexes: [],
  layoutSource: "manual",
};

describe("relation endpoint snapping", () => {
  it("projects a dragged endpoint onto the nearest table side", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 60, y: 143 }, true);

    expect(endpoint.side).toBe("west");
    expect(endpoint.point).toEqual({ x: 100, y: 144 });
    expect(endpoint.offsetX).toBe(0);
  });

  it("snaps horizontal-side endpoints along the table edge", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 210, y: 20 }, true);

    expect(endpoint.side).toBe("north");
    expect(endpoint.point).toEqual({ x: 212, y: 80 });
    expect(endpoint.offsetY).toBe(0);
  });

  it("clamps snapped endpoints to the entity bounds", () => {
    const endpoint = snapRelationEndpoint(table, "id", { x: 380, y: 999 }, true);

    expect(endpoint.side).toBe("south");
    expect(endpoint.point).toEqual({ x: 340, y: 240 });
  });
});
