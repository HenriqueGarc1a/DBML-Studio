import type { DiagramModel, TableModel } from "../model/types";
import type { DatabaseDialect, IntrospectedDatabaseSchema, IntrospectedTable } from "./types";

export type SchemaDiffKind = "table-add" | "table-remove" | "column-add" | "column-remove" | "column-type" | "column-nullability" | "index" | "relation";

export interface SchemaDiffItem {
  kind: SchemaDiffKind;
  table: string;
  column?: string;
  message: string;
  destructive: boolean;
}

export function compareDiagramToDatabase(diagram: DiagramModel, schema: IntrospectedDatabaseSchema): SchemaDiffItem[] {
  const items: SchemaDiffItem[] = [];
  const desired = new Map(diagram.tables.map((table) => [normalizeName(table.name), table]));
  const actual = new Map(schema.tables.map((table) => [normalizeName(effectiveTableName(table, schema.dialect)), table]));

  for (const table of diagram.tables) {
    const databaseTable = findActualTable(actual, table.name);
    if (!databaseTable) {
      items.push({ kind: "table-add", table: table.name, message: `Criar tabela ${table.name} no banco`, destructive: false });
      continue;
    }
    compareColumns(items, table, databaseTable);
    compareIndexes(items, table, databaseTable);
  }

  for (const table of schema.tables) {
    const name = effectiveTableName(table, schema.dialect);
    if (!findDesiredTable(desired, name)) items.push({ kind: "table-remove", table: name, message: `Tabela ${name} existe no banco, mas não no projeto`, destructive: true });
  }

  const actualRelations = new Set(schema.tables.flatMap((table) => table.foreignKeys.map((foreignKey) => relationSignature(
    effectiveTableName(table, schema.dialect),
    foreignKey.columns,
    effectiveReferencedName(foreignKey.referencedSchema, foreignKey.referencedTable, schema.dialect),
    foreignKey.referencedColumns,
  ))));
  for (const relation of diagram.relations) {
    const from = diagram.tables.find((table) => table.id === relation.fromTable)?.name ?? relation.fromTable;
    const to = diagram.tables.find((table) => table.id === relation.toTable)?.name ?? relation.toTable;
    const signature = relationSignature(from, relation.fromColumns ?? [relation.fromColumn], to, relation.toColumns ?? [relation.toColumn]);
    if (!actualRelations.has(signature)) items.push({ kind: "relation", table: from, message: `Criar relação ${from} → ${to}`, destructive: false });
  }
  return items;
}

export function generateMigrationSql(diagram: DiagramModel, schema: IntrospectedDatabaseSchema): string {
  const dialect = schema.dialect;
  const statements: string[] = [`-- DBML Studio · sugestão de migration para ${schema.database}`, "-- Revise o SQL antes de executar. Operações destrutivas ficam comentadas."];
  const actual = new Map(schema.tables.map((table) => [normalizeName(effectiveTableName(table, dialect)), table]));
  const desiredNames = new Set(diagram.tables.map((table) => normalizeName(table.name)));

  for (const table of diagram.tables) {
    const databaseTable = findActualTable(actual, table.name);
    if (!databaseTable) {
      statements.push(createTableSql(table, dialect));
    } else {
      const actualColumns = new Map(databaseTable.columns.map((column) => [normalizeName(column.name), column]));
      for (const column of table.columns) {
        const current = actualColumns.get(normalizeName(column.name));
        if (!current) {
          statements.push(`ALTER TABLE ${quotePath(table.name, dialect)} ADD COLUMN ${columnDefinition(column, dialect)};`);
          continue;
        }
        if (normalizeType(column.type) !== normalizeType(current.type)) {
          statements.push(alterColumnTypeSql(table.name, column.name, column.type, column.nullable, dialect));
        } else if (column.nullable !== current.nullable) {
          statements.push(alterNullabilitySql(table.name, column.name, column.type, column.nullable, dialect));
        }
      }
      for (const column of databaseTable.columns) {
        if (!table.columns.some((item) => normalizeName(item.name) === normalizeName(column.name))) {
          statements.push(`-- DESTRUTIVO: ALTER TABLE ${quotePath(table.name, dialect)} DROP COLUMN ${quoteIdentifier(column.name, dialect)};`);
        }
      }
    }

    const currentIndexSignatures = new Set(databaseTable?.indexes.map(indexSignature) ?? []);
    for (const index of table.indexes) {
      if (databaseTable && index.primary && index.columns.length > 1 && !currentIndexSignatures.has(indexSignature(index))) {
        statements.push(`ALTER TABLE ${quotePath(table.name, dialect)} ADD PRIMARY KEY (${index.columns.map((column) => quoteIdentifier(column, dialect)).join(", ")});`);
      } else if (!index.primary && !currentIndexSignatures.has(indexSignature(index))) {
        statements.push(createIndexSql(table.name, index, dialect));
      }
    }
  }

  const actualRelations = new Set(schema.tables.flatMap((table) => table.foreignKeys.map((foreignKey) => relationSignature(
    effectiveTableName(table, dialect), foreignKey.columns,
    effectiveReferencedName(foreignKey.referencedSchema, foreignKey.referencedTable, dialect), foreignKey.referencedColumns,
  ))));
  for (const relation of diagram.relations) {
    const from = diagram.tables.find((table) => table.id === relation.fromTable)?.name ?? relation.fromTable;
    const to = diagram.tables.find((table) => table.id === relation.toTable)?.name ?? relation.toTable;
    const fromColumns = relation.fromColumns ?? [relation.fromColumn];
    const toColumns = relation.toColumns ?? [relation.toColumn];
    if (!actualRelations.has(relationSignature(from, fromColumns, to, toColumns))) {
      statements.push(createForeignKeySql(from, fromColumns, to, toColumns, relation.dbmlName, relation.dbmlSettings, dialect));
    }
  }
  for (const table of schema.tables) {
    const name = effectiveTableName(table, dialect);
    if (!desiredNames.has(normalizeName(name)) && !Array.from(desiredNames).some((item) => item.endsWith(`.${normalizeName(table.name)}`))) {
      statements.push(`-- DESTRUTIVO: DROP TABLE ${quotePath(name, dialect)};`);
    }
  }

  if (statements.length === 2) statements.push("-- Nenhuma alteração estrutural detectada.");
  return `${statements.join("\n\n")}\n`;
}

function compareColumns(items: SchemaDiffItem[], desired: TableModel, actual: IntrospectedTable): void {
  const actualColumns = new Map(actual.columns.map((column) => [normalizeName(column.name), column]));
  for (const column of desired.columns) {
    const current = actualColumns.get(normalizeName(column.name));
    if (!current) items.push({ kind: "column-add", table: desired.name, column: column.name, message: `Adicionar ${desired.name}.${column.name}`, destructive: false });
    else {
      if (normalizeType(column.type) !== normalizeType(current.type)) items.push({ kind: "column-type", table: desired.name, column: column.name, message: `${desired.name}.${column.name}: ${current.type} → ${column.type}`, destructive: true });
      if (column.nullable !== current.nullable) items.push({ kind: "column-nullability", table: desired.name, column: column.name, message: `${desired.name}.${column.name}: alterar nulabilidade`, destructive: !column.nullable });
    }
  }
  for (const column of actual.columns) {
    if (!desired.columns.some((item) => normalizeName(item.name) === normalizeName(column.name))) items.push({ kind: "column-remove", table: desired.name, column: column.name, message: `${desired.name}.${column.name} existe apenas no banco`, destructive: true });
  }
}

function compareIndexes(items: SchemaDiffItem[], desired: TableModel, actual: IntrospectedTable): void {
  const signatures = new Set(actual.indexes.map(indexSignature));
  for (const index of desired.indexes) {
    const signature = indexSignature(index);
    if (!signatures.has(signature)) items.push({ kind: "index", table: desired.name, message: `Criar índice em ${desired.name} (${index.columns.join(", ")})`, destructive: false });
  }
}

function createTableSql(table: TableModel, dialect: DatabaseDialect): string {
  const columns = table.columns.map((column) => `  ${columnDefinition(column, dialect)}`);
  const compositePrimary = table.indexes.find((index) => index.primary && index.columns.length > 1);
  if (compositePrimary) columns.push(`  PRIMARY KEY (${compositePrimary.columns.map((column) => quoteIdentifier(column, dialect)).join(", ")})`);
  return `CREATE TABLE ${quotePath(table.name, dialect)} (\n${columns.join(",\n")}\n);`;
}

function columnDefinition(column: TableModel["columns"][number], dialect: DatabaseDialect): string {
  const pieces = [quoteIdentifier(column.name, dialect), column.type || "text"];
  const autoIncrement = column.rawSettings.some((setting) => /^(?:increment|identity|auto_increment)$/i.test(setting.trim()));
  if (autoIncrement && dialect === "postgres") pieces.push("GENERATED BY DEFAULT AS IDENTITY");
  if (!column.nullable) pieces.push("NOT NULL");
  if (column.primaryKey) pieces.push("PRIMARY KEY");
  if (autoIncrement && dialect === "mysql") pieces.push("AUTO_INCREMENT");
  if (autoIncrement && dialect === "sqlite" && column.primaryKey) pieces.push("AUTOINCREMENT");
  if (column.unique) pieces.push("UNIQUE");
  if (column.defaultValue) pieces.push(`DEFAULT ${column.defaultValue}`);
  return pieces.join(" ");
}

function createIndexSql(tableName: string, index: TableModel["indexes"][number], dialect: DatabaseDialect): string {
  const generatedName = `${tableName.replace(/[^A-Za-z0-9_]+/g, "_")}_${index.columns.join("_")}_idx`;
  const name = index.name?.trim() || generatedName;
  const using = index.type && index.type.toLowerCase() !== "btree" && dialect === "postgres" ? ` USING ${index.type}` : "";
  return `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quoteIdentifier(name, dialect)} ON ${quotePath(tableName, dialect)}${using} (${index.columns.map((column) => quoteIdentifier(column, dialect)).join(", ")});`;
}

function createForeignKeySql(from: string, fromColumns: string[], to: string, toColumns: string[], name: string | undefined, settings: string[] | undefined, dialect: DatabaseDialect): string {
  const constraint = name?.trim() ? ` CONSTRAINT ${quoteIdentifier(name, dialect)}` : "";
  const actions = (settings ?? []).map((setting) => {
    const match = setting.match(/^\s*(delete|update)\s*:\s*(cascade|restrict|set null|set default|no action)\s*$/i);
    return match ? ` ON ${match[1].toUpperCase()} ${match[2].toUpperCase()}` : "";
  }).join("");
  return `ALTER TABLE ${quotePath(from, dialect)} ADD${constraint} FOREIGN KEY (${fromColumns.map((column) => quoteIdentifier(column, dialect)).join(", ")}) REFERENCES ${quotePath(to, dialect)} (${toColumns.map((column) => quoteIdentifier(column, dialect)).join(", ")})${actions};`;
}

function indexSignature(index: { unique?: boolean; primary?: boolean; columns: string[] }): string {
  return `${index.primary ? "p" : index.unique ? "u" : "n"}:${index.columns.map(normalizeName).join(",")}`;
}

function alterColumnTypeSql(table: string, column: string, type: string, nullable: boolean, dialect: DatabaseDialect): string {
  if (dialect === "postgres") return `ALTER TABLE ${quotePath(table, dialect)} ALTER COLUMN ${quoteIdentifier(column, dialect)} TYPE ${type};`;
  if (dialect === "mysql") return `ALTER TABLE ${quotePath(table, dialect)} MODIFY COLUMN ${quoteIdentifier(column, dialect)} ${type}${nullable ? " NULL" : " NOT NULL"};`;
  return `-- SQLite: recrie ${quotePath(table, dialect)} para alterar ${quoteIdentifier(column, dialect)} para ${type}.`;
}

function alterNullabilitySql(table: string, column: string, type: string, nullable: boolean, dialect: DatabaseDialect): string {
  if (dialect === "postgres") return `ALTER TABLE ${quotePath(table, dialect)} ALTER COLUMN ${quoteIdentifier(column, dialect)} ${nullable ? "DROP" : "SET"} NOT NULL;`;
  if (dialect === "mysql") return `ALTER TABLE ${quotePath(table, dialect)} MODIFY COLUMN ${quoteIdentifier(column, dialect)} ${type}${nullable ? " NULL" : " NOT NULL"};`;
  return `-- SQLite: recrie ${quotePath(table, dialect)} para alterar a nulabilidade de ${quoteIdentifier(column, dialect)}.`;
}

function findActualTable(map: Map<string, IntrospectedTable>, name: string): IntrospectedTable | undefined {
  const normalized = normalizeName(name);
  return map.get(normalized) ?? Array.from(map.entries()).find(([key]) => key.endsWith(`.${normalized}`))?.[1];
}

function findDesiredTable(map: Map<string, TableModel>, name: string): TableModel | undefined {
  const normalized = normalizeName(name);
  return map.get(normalized) ?? Array.from(map.entries()).find(([key]) => normalized.endsWith(`.${key}`) || key.endsWith(`.${normalized}`))?.[1];
}

function effectiveTableName(table: IntrospectedTable, dialect: DatabaseDialect): string {
  return dialect === "postgres" && table.schema !== "public" ? `${table.schema}.${table.name}` : table.name;
}

function effectiveReferencedName(schema: string, table: string, dialect: DatabaseDialect): string {
  return dialect === "postgres" && schema !== "public" ? `${schema}.${table}` : table;
}

function relationSignature(from: string, fromColumns: string[], to: string, toColumns: string[]): string {
  return `${normalizeName(from)}.(${fromColumns.map(normalizeName).join(",")})>${normalizeName(to)}.(${toColumns.map(normalizeName).join(",")})`;
}

function normalizeName(value: string): string { return value.replace(/["`]/g, "").trim().toLocaleLowerCase(); }
function normalizeType(value: string): string { return value.toLocaleLowerCase().replace(/\s+/g, "").replace(/charactervarying/g, "varchar").replace(/timestampwithouttimezone/g, "timestamp"); }
function quotePath(value: string, dialect: DatabaseDialect): string { return value.split(".").map((part) => quoteIdentifier(part, dialect)).join("."); }
function quoteIdentifier(value: string, dialect: DatabaseDialect): string { const marker = dialect === "mysql" ? "`" : '"'; return `${marker}${value.split(marker).join(marker + marker)}${marker}`; }
