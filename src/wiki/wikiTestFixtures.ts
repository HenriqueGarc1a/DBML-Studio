import { defaultDiagramVisual, defaultRelationVisual, defaultTableVisual } from "../model/defaults";
import type { ColumnModel, DiagramModel, TableModel } from "../model/types";

export function wikiTestDiagram(): DiagramModel {
  const customers = table("customers", [
    column("customers", "id", "uuid", { primaryKey: true, nullable: false, note: "Identificador do cliente" }),
    column("customers", "email", "varchar(255)", { unique: true, nullable: false }),
  ]);
  const orders = table("orders", [
    column("orders", "id", "uuid", { primaryKey: true, nullable: false }),
    column("orders", "customer_id", "uuid", { foreignKey: true, nullable: false }),
  ]);
  return {
    id: "diagram",
    source: "",
    visual: defaultDiagramVisual,
    tables: [customers, orders],
    relations: [{
      id: "orders-customers",
      ...defaultRelationVisual,
      fromTable: "orders",
      fromColumn: "customer_id",
      toTable: "customers",
      toColumn: "id",
      fromSide: "west",
      toSide: "east",
    }],
    groups: [],
    enums: [{ id: "status", name: "order_status", values: ["pending", "paid"] }],
  };
}

function table(name: string, columns: ColumnModel[]): TableModel {
  return {
    id: name,
    name,
    columns,
    indexes: [],
    x: 0,
    y: 0,
    width: 220,
    height: 120,
    visual: defaultTableVisual,
    usesDefaultStyle: true,
    usesGroupStyle: false,
    layoutSource: "manual",
  };
}

function column(tableName: string, name: string, type: string, patch: Partial<ColumnModel> = {}): ColumnModel {
  return {
    id: `column-${tableName}-${name}`,
    name,
    type,
    nullable: true,
    primaryKey: false,
    foreignKey: false,
    rawSettings: [],
    ...patch,
  };
}
