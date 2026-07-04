import { describe, expect, it } from "vitest";
import { parseDbml } from "../parser/dbmlParser";
import { sqlToDbml } from "./sqlToDbml";

describe("sqlToDbml", () => {
  it("translates create table statements with keys and references", () => {
    const dbml = sqlToDbml(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name TEXT DEFAULT 'Anon'
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total NUMERIC(10, 2) NOT NULL
      );
    `);

    expect(dbml).toContain("Table users");
    expect(dbml).toContain("id int [pk]");
    expect(dbml).toContain("email varchar(255) [not null, unique]");
    expect(dbml).toContain("Ref: orders.user_id > users.id");

    const diagram = parseDbml(dbml);
    expect(diagram.tables).toHaveLength(2);
    expect(diagram.relations[0]).toMatchObject({
      fromTable: "orders",
      fromColumn: "user_id",
      toTable: "users",
      toColumn: "id",
    });
  });

  it("applies table constraints from alter table statements", () => {
    const dbml = sqlToDbml(`
      CREATE TABLE projects (
        id INT,
        owner_id INT,
        slug VARCHAR(80)
      );

      CREATE TABLE users (
        id INT
      );

      ALTER TABLE projects ADD CONSTRAINT projects_pk PRIMARY KEY (id);
      ALTER TABLE projects ADD CONSTRAINT projects_slug_unique UNIQUE (slug);
      ALTER TABLE projects ADD CONSTRAINT projects_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id);
    `);

    expect(dbml).toContain("id int [pk]");
    expect(dbml).toContain("slug varchar(80) [unique]");
    expect(dbml).toContain("Ref: projects.owner_id > users.id");
  });

  it("fails clearly when no table can be translated", () => {
    expect(() => sqlToDbml("select 1;")).toThrow("Nenhum CREATE TABLE");
  });
});
