import { describe, expect, it } from "vitest";
import { parseDbml } from "../parser/dbmlParser";
import { compareDiagramToDatabase, generateMigrationSql } from "./schemaDiff";
import { databaseFixture } from "./schemaToDbml.test";

describe("schema diff", () => {
  it("reports drift and creates a reviewable migration", () => {
    const diagram = parseDbml(`Table users {
  id int4 [pk, not null]
  email varchar [not null]
}

Table products {
  id int [pk]
}`);
    const diff = compareDiagramToDatabase(diagram, databaseFixture);
    expect(diff.some((item) => item.kind === "column-add" && item.column === "email")).toBe(true);
    expect(diff.some((item) => item.kind === "table-add" && item.table === "products")).toBe(true);
    expect(diff.some((item) => item.kind === "table-remove" && item.table === "sales.orders")).toBe(true);
    const schemaWithoutRelations = { ...databaseFixture, tables: databaseFixture.tables.map((table) => ({ ...table, foreignKeys: [] })) };
    const sql = generateMigrationSql(diagram, schemaWithoutRelations);
    expect(sql).toContain('ALTER TABLE "users" ADD COLUMN "email" varchar NOT NULL;');
    expect(sql).toContain('CREATE TABLE "products"');
    expect(sql).toContain('-- DESTRUTIVO: DROP TABLE "sales"."orders";');
  });

  it("suggests missing indexes and foreign keys", () => {
    const diagram = parseDbml(`Table users {
  id int4 [pk, not null]
}

Table sales.orders {
  tenant_id int4 [not null]
  user_id int4 [not null]

  indexes {
    (tenant_id, user_id) [unique, name: orders_tenant_user]
    (tenant_id) [name: orders_tenant_idx]
  }
}

Ref orders_user_fk: sales.orders.user_id > users.id [delete: cascade]`);
    const schemaWithoutRelations = { ...databaseFixture, tables: databaseFixture.tables.map((table) => ({ ...table, foreignKeys: [] })) };
    const sql = generateMigrationSql(diagram, schemaWithoutRelations);
    expect(sql).toContain('CREATE INDEX "orders_tenant_idx" ON "sales"."orders" ("tenant_id");');
    expect(sql).toContain('ALTER TABLE "sales"."orders" ADD CONSTRAINT "orders_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;');
  });
});
