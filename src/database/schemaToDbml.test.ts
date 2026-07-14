import { describe, expect, it } from "vitest";
import { parseDbml } from "../parser/dbmlParser";
import { introspectedSchemaToDbml } from "./schemaToDbml";
import type { IntrospectedDatabaseSchema } from "./types";

export const databaseFixture: IntrospectedDatabaseSchema = {
  dialect: "postgres",
  database: "shop",
  tables: [
    { schema: "public", name: "users", columns: [{ name: "id", type: "int4", nullable: false, primaryKey: true, autoIncrement: true }], indexes: [{ name: "users_pkey", columns: ["id"], unique: true, primary: true, type: "btree" }], foreignKeys: [] },
    { schema: "sales", name: "orders", columns: [{ name: "tenant_id", type: "int4", nullable: false, primaryKey: false, autoIncrement: false }, { name: "user_id", type: "int4", nullable: false, primaryKey: false, autoIncrement: false }], indexes: [{ name: "orders_tenant_user", columns: ["tenant_id", "user_id"], unique: true, primary: false, type: "btree" }], foreignKeys: [{ name: "orders_user_fk", columns: ["user_id"], referencedSchema: "public", referencedTable: "users", referencedColumns: ["id"], onUpdate: "NO ACTION", onDelete: "CASCADE" }] },
  ],
};

describe("introspectedSchemaToDbml", () => {
  it("converts schemas, indexes and foreign keys to parseable DBML", () => {
    const dbml = introspectedSchemaToDbml(databaseFixture);
    expect(dbml).toContain("Table sales.orders");
    expect(dbml).toContain("[unique, name: orders_tenant_user]");
    expect(dbml).toContain("Ref orders_user_fk: sales.orders.user_id > users.id [delete: cascade]");
    const parsed = parseDbml(dbml);
    expect(parsed.tables).toHaveLength(2);
    expect(parsed.relations[0]).toMatchObject({ fromTable: "sales-orders", toTable: "users" });
  });

  it("preserves composite primary keys as table indexes", () => {
    const dbml = introspectedSchemaToDbml({
      dialect: "sqlite",
      database: "tenant.sqlite",
      tables: [{
        schema: "main", name: "memberships",
        columns: [
          { name: "tenant_id", type: "integer", nullable: false, primaryKey: false, autoIncrement: false },
          { name: "user_id", type: "integer", nullable: false, primaryKey: false, autoIncrement: false },
        ],
        indexes: [{ name: "memberships_primary", columns: ["tenant_id", "user_id"], unique: true, primary: true, type: "btree" }],
        foreignKeys: [],
      }],
    });
    expect(dbml).toContain("(tenant_id, user_id) [pk, name: memberships_primary]");
    expect(parseDbml(dbml).tables[0].indexes[0]).toMatchObject({ columns: ["tenant_id", "user_id"], primary: true });
  });
});
