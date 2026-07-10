import { describe, expect, it } from "vitest";
import { defaultTableVisual } from "./defaults";
import type { TableModel } from "./types";
import { getVisualColumns } from "./tableColumns";

describe("visual column order", () => {
  it("uses UI order while always keeping primary keys first", () => {
    const table: TableModel = {
      id: "items", name: "items", x: 0, y: 0, width: 220, height: 120,
      columns: [column("name"), column("owner_id"), column("id", true)],
      columnOrder: ["owner_id", "name", "id"],
      visual: defaultTableVisual, usesDefaultStyle: true, usesGroupStyle: false,
      indexes: [], layoutSource: "manual",
    };
    expect(getVisualColumns(table).map((column) => column.name)).toEqual(["id", "owner_id", "name"]);
    expect(table.columns.map((column) => column.name)).toEqual(["name", "owner_id", "id"]);
  });
});

function column(name: string, primaryKey = false) {
  return { id: name, name, type: "int", nullable: false, primaryKey, foreignKey: false, rawSettings: [] };
}
