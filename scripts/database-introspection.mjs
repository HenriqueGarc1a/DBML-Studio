import { stat } from "node:fs/promises";
import path from "node:path";

export class DatabaseIntrospectionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function introspectDatabase(body, sqliteRoot) {
  const config = requireConnection(body);
  if (config.dialect === "postgres") return introspectPostgres(config);
  if (config.dialect === "mysql") return introspectMysql(config);
  return introspectSqlite(config, path.resolve(sqliteRoot));
}

function requireConnection(body) {
  const dialect = body?.dialect;
  if (dialect !== "postgres" && dialect !== "mysql" && dialect !== "sqlite") {
    throw new DatabaseIntrospectionError(400, "Dialect must be postgres, mysql or sqlite");
  }
  if (dialect === "sqlite") {
    if (typeof body.path !== "string" || !body.path.trim()) throw new DatabaseIntrospectionError(400, "SQLite path is required");
    return { dialect, path: body.path.trim() };
  }
  const host = requireShortString(body.host, "host");
  const database = requireShortString(body.database, "database");
  const user = requireShortString(body.user, "user");
  const port = Number(body.port ?? (dialect === "postgres" ? 5432 : 3306));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DatabaseIntrospectionError(400, "Invalid database port");
  return { dialect, host, port, database, user, password: typeof body.password === "string" ? body.password : "", ssl: body.ssl === true };
}

function requireShortString(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 255) throw new DatabaseIntrospectionError(400, `Invalid ${name}`);
  return value.trim();
}

async function introspectPostgres(config) {
  const pg = await import("pg");
  const Client = pg.Client ?? pg.default?.Client;
  const client = new Client({
    host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000, statement_timeout: 20_000, application_name: "dbml-studio-introspection",
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const [columnsResult, indexesResult, foreignKeysResult] = await Promise.all([
      client.query(`SELECT table_schema, table_name, column_name, data_type, udt_name,
        character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default, ordinal_position
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name, ordinal_position`),
      client.query(`SELECT ns.nspname AS table_schema, tbl.relname AS table_name, idx.relname AS index_name,
        i.indisunique AS is_unique, i.indisprimary AS is_primary, am.amname AS index_type,
        array_agg(att.attname ORDER BY keys.ordinality) AS columns
        FROM pg_index i
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_am am ON am.oid = idx.relam
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = keys.attnum
        WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY ns.nspname, tbl.relname, idx.relname, i.indisunique, i.indisprimary, am.amname
        ORDER BY ns.nspname, tbl.relname, idx.relname`),
      client.query(`SELECT tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name,
        ccu.table_schema AS referenced_schema, ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column, rc.update_rule, rc.delete_rule, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_catalog = kcu.constraint_catalog AND tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_catalog = rc.constraint_catalog AND tc.constraint_schema = rc.constraint_schema AND tc.constraint_name = rc.constraint_name
        JOIN information_schema.key_column_usage ccu
          ON ccu.constraint_catalog = rc.unique_constraint_catalog AND ccu.constraint_schema = rc.unique_constraint_schema
          AND ccu.constraint_name = rc.unique_constraint_name AND ccu.ordinal_position = kcu.position_in_unique_constraint
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`),
    ]);
    return buildSchema("postgres", config.database, columnsResult.rows, indexesResult.rows, foreignKeysResult.rows);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function introspectMysql(config) {
  const imported = await import("mysql2/promise");
  const mysql = imported.default ?? imported;
  const connection = await mysql.createConnection({
    host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
    ssl: config.ssl ? {} : undefined, connectTimeout: 10_000,
  });
  try {
    const [columns] = await connection.execute(`SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
      COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type, IS_NULLABLE AS is_nullable,
      COLUMN_DEFAULT AS column_default, ORDINAL_POSITION AS ordinal_position, EXTRA AS extra
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [config.database]);
    const [indexRows] = await connection.execute(`SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
      INDEX_NAME AS index_name, NON_UNIQUE AS non_unique, INDEX_TYPE AS index_type,
      COLUMN_NAME AS column_name, SEQ_IN_INDEX AS ordinal_position
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [config.database]);
    const [foreignKeys] = await connection.execute(`SELECT k.TABLE_SCHEMA AS table_schema, k.TABLE_NAME AS table_name,
      k.CONSTRAINT_NAME AS constraint_name, k.COLUMN_NAME AS column_name,
      k.REFERENCED_TABLE_SCHEMA AS referenced_schema, k.REFERENCED_TABLE_NAME AS referenced_table,
      k.REFERENCED_COLUMN_NAME AS referenced_column, r.UPDATE_RULE AS update_rule,
      r.DELETE_RULE AS delete_rule, k.ORDINAL_POSITION AS ordinal_position
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`, [config.database]);
    return buildSchema("mysql", config.database, columns, groupMysqlIndexes(indexRows), foreignKeys);
  } finally {
    await connection.end();
  }
}

async function introspectSqlite(config, sqliteRoot) {
  const candidate = path.resolve(sqliteRoot, config.path);
  if (!isInside(sqliteRoot, candidate)) throw new DatabaseIntrospectionError(403, `SQLite files must be inside ${sqliteRoot}`);
  if (!await isFile(candidate)) throw new DatabaseIntrospectionError(404, "SQLite database not found");
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(candidate, { readOnly: true });
  try {
    const rows = database.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = rows.map((row) => introspectSqliteTable(database, row));
    return { dialect: "sqlite", database: path.basename(candidate), tables };
  } finally {
    database.close();
  }
}

function introspectSqliteTable(database, row) {
  const name = String(row.name);
  const quoted = quoteSqlite(name);
  const columnRows = database.prepare(`PRAGMA table_info(${quoted})`).all();
  const indexRows = database.prepare(`PRAGMA index_list(${quoted})`).all();
  const indexes = indexRows.map((indexRow) => {
    const indexName = String(indexRow.name);
    const columns = database.prepare(`PRAGMA index_info(${quoteSqlite(indexName)})`).all()
      .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((item) => String(item.name));
    return { name: indexName, columns, unique: Boolean(indexRow.unique), primary: String(indexRow.origin) === "pk", type: "btree" };
  });
  const primaryColumns = columnRows.filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => String(column.name));
  if (primaryColumns.length > 1 && !indexes.some((index) => index.primary)) {
    indexes.push({ name: `${name}_primary`, columns: primaryColumns, unique: true, primary: true, type: "btree" });
  }
  const tableSql = String(row.sql ?? "");
  return {
    schema: "main", name,
    columns: columnRows.sort((a, b) => Number(a.cid) - Number(b.cid)).map((column) => ({
      name: String(column.name), type: String(column.type || "text"), nullable: !column.notnull && !column.pk,
      defaultValue: column.dflt_value === null ? undefined : String(column.dflt_value),
      primaryKey: primaryColumns.length === 1 && Boolean(column.pk),
      autoIncrement: primaryColumns.length === 1 && Boolean(column.pk) && /\bAUTOINCREMENT\b/i.test(tableSql),
    })),
    indexes,
    foreignKeys: groupSqliteForeignKeys(database.prepare(`PRAGMA foreign_key_list(${quoted})`).all()),
  };
}

function buildSchema(dialect, database, columnRows, indexRows, foreignKeyRows) {
  const tables = new Map();
  for (const row of columnRows) {
    const schema = String(row.table_schema ?? database);
    const name = String(row.table_name);
    const key = `${schema}.${name}`;
    if (!tables.has(key)) tables.set(key, { schema, name, columns: [], indexes: [], foreignKeys: [] });
    tables.get(key).columns.push({
      name: String(row.column_name), type: formatType(row), nullable: String(row.is_nullable).toUpperCase() === "YES",
      defaultValue: row.column_default === null || row.column_default === undefined ? undefined : String(row.column_default),
      primaryKey: false,
      autoIncrement: /auto_increment/i.test(String(row.extra ?? "")) || /nextval\(/i.test(String(row.column_default ?? "")),
    });
  }
  for (const row of indexRows) {
    const table = tables.get(`${row.table_schema}.${row.table_name}`);
    if (!table) continue;
    const index = {
      name: String(row.index_name), columns: Array.isArray(row.columns) ? row.columns.map(String) : [],
      unique: row.is_unique === true || row.non_unique === 0 || row.non_unique === "0",
      primary: row.is_primary === true || String(row.index_name).toUpperCase() === "PRIMARY",
      type: String(row.index_type ?? "btree").toLowerCase(),
    };
    table.indexes.push(index);
    if (index.primary && index.columns.length === 1) {
      const column = table.columns.find((item) => item.name === index.columns[0]);
      if (column) column.primaryKey = true;
    }
  }
  for (const foreignKey of groupForeignKeys(foreignKeyRows)) {
    tables.get(`${foreignKey.schema}.${foreignKey.table}`)?.foreignKeys.push(foreignKey);
  }
  return { dialect, database, tables: Array.from(tables.values()) };
}

function groupMysqlIndexes(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}.${row.index_name}`;
    if (!grouped.has(key)) grouped.set(key, { ...row, columns: [] });
    grouped.get(key).columns.push(String(row.column_name));
  }
  return Array.from(grouped.values());
}

function groupForeignKeys(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}.${row.constraint_name}`;
    if (!grouped.has(key)) grouped.set(key, {
      name: String(row.constraint_name), schema: String(row.table_schema), table: String(row.table_name), columns: [],
      referencedSchema: String(row.referenced_schema), referencedTable: String(row.referenced_table), referencedColumns: [],
      onUpdate: String(row.update_rule ?? "NO ACTION"), onDelete: String(row.delete_rule ?? "NO ACTION"),
    });
    grouped.get(key).columns.push(String(row.column_name));
    grouped.get(key).referencedColumns.push(String(row.referenced_column));
  }
  return Array.from(grouped.values());
}

function groupSqliteForeignKeys(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.id);
    if (!grouped.has(key)) grouped.set(key, {
      name: `fk_${row.id}`, columns: [], referencedSchema: "main", referencedTable: String(row.table), referencedColumns: [],
      onUpdate: String(row.on_update ?? "NO ACTION"), onDelete: String(row.on_delete ?? "NO ACTION"),
    });
    grouped.get(key).columns.push(String(row.from));
    grouped.get(key).referencedColumns.push(String(row.to));
  }
  return Array.from(grouped.values());
}

function formatType(row) {
  if (row.data_type && /\(/.test(String(row.data_type))) return String(row.data_type);
  const base = String(row.udt_name ?? row.data_type ?? "text");
  if (row.character_maximum_length) return `${base}(${row.character_maximum_length})`;
  if (row.numeric_precision && row.numeric_scale) return `${base}(${row.numeric_precision},${row.numeric_scale})`;
  return base;
}

function quoteSqlite(value) { return `"${value.replace(/"/g, '""')}"`; }
function isInside(root, candidate) { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
async function isFile(file) { return stat(file).then((value) => value.isFile()).catch(() => false); }
