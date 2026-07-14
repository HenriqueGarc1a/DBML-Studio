import { randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.env.STATIC_DIR ?? path.join(appRoot, "dist"));
const savesDir = path.resolve(process.env.DBML_SAVES_DIR ?? path.join(appRoot, "saves"));
const legacyDir = path.resolve(process.env.DBML_LEGACY_DIR ?? path.join(appRoot, "dbml"));
const host = process.env.HOST?.trim() || "0.0.0.0";
const parsedPort = Number.parseInt(process.env.PORT ?? "8080", 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 8080;
const maxBodyBytes = parseByteLimit(process.env.MAX_BODY_BYTES, 32 * 1024 * 1024);
const sqliteRoot = path.resolve(process.env.DBML_SQLITE_ROOT ?? savesDir);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

await ensureStorage();
await assertStaticBuild();

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Method not allowed");
      await access(savesDir, constants.R_OK | constants.W_OK);
      sendJson(response, 200, { status: "ok" }, request.method === "HEAD");
      return;
    }

    if (url.pathname.startsWith("/__dbml/")) {
      await handleDbmlApi(request, response, url.pathname);
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!response.headersSent) sendJson(response, status, { error: message });
    else response.destroy();
    if (status >= 500) console.error(error);
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`DBML Studio listening on http://${host}:${actualPort}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close((error) => process.exit(error ? 1 : 0));
  });
}

async function handleDbmlApi(request, response, pathname) {
  if (pathname === "/__dbml/list") {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
    sendJson(response, 200, { files: await listDiagrams() });
    return;
  }

  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await readJsonBody(request, maxBodyBytes);

  if (pathname === "/__dbml/introspect") {
    const config = requireDatabaseConnection(body);
    try {
      const schema = config.dialect === "postgres"
        ? await introspectPostgres(config)
        : config.dialect === "mysql"
          ? await introspectMysql(config)
          : await introspectSqlite(config);
      sendJson(response, 200, { schema });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const message = error instanceof Error ? error.message : "Database introspection failed";
      throw new HttpError(502, `Não foi possível introspectar o banco: ${message}`);
    }
    return;
  }

  if (pathname === "/__dbml/save") {
    const filename = requireFilename(body.filename);
    const contents = typeof body.contents === "string" ? body.contents : "";
    if (!contents.trim()) throw new HttpError(400, "Invalid DBML payload");

    const directory = saveDirectory(filename);
    await mkdir(directory, { recursive: true });
    await atomicWrite(path.join(directory, "diagram.dbml"), contents);
    if (typeof body.uiLayout === "string" && body.uiLayout.trim()) {
      await atomicWrite(path.join(directory, "ui.json"), body.uiLayout);
    }
    if (typeof body.previewDataUrl === "string") {
      const preview = body.previewDataUrl.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/)?.[1];
      if (preview) await atomicWrite(path.join(directory, "preview.webp"), Buffer.from(preview, "base64"));
    }
    sendJson(response, 200, { filename });
    return;
  }

  if (pathname === "/__dbml/wiki") {
    const filename = requireFilename(body.filename);
    const contents = typeof body.contents === "string" ? body.contents : "";
    const document = typeof body.document === "string" ? body.document : undefined;
    const directory = saveDirectory(filename);
    if (!await isFile(path.join(directory, "diagram.dbml"))) throw new HttpError(404, "Diagram not found");
    if (document !== undefined) {
      try {
        const parsed = JSON.parse(document);
        if (!isStructuredWikiDocument(parsed)) throw new Error("Invalid document");
      } catch {
        throw new HttpError(400, "Invalid structured Wiki document");
      }
      // wiki.json is the editable source of truth; commit it before its derived
      // Markdown so an interrupted write can always be repaired on next load.
      await atomicWrite(path.join(directory, "wiki.json"), document);
    } else {
      // A legacy Markdown-only save must not be shadowed by a stale wiki.json.
      await rm(path.join(directory, "wiki.json"), { force: true });
    }
    await atomicWrite(path.join(directory, "wiki.md"), contents);
    sendJson(response, 200, { filename });
    return;
  }

  if (pathname === "/__dbml/rename") {
    const from = requireFilename(body.from);
    const to = requireFilename(body.to);
    if (from !== to) {
      const fromDirectory = saveDirectory(from);
      const toDirectory = saveDirectory(to);
      if (!await isDirectory(fromDirectory)) throw new HttpError(404, "Diagram not found");
      if (await isDirectory(toDirectory)) throw new HttpError(409, "A diagram with this name already exists");
      await rename(fromDirectory, toDirectory);
    }
    sendJson(response, 200, { filename: to });
    return;
  }

  if (pathname === "/__dbml/delete") {
    const filename = requireFilename(body.filename);
    await rm(saveDirectory(filename), { recursive: true, force: true });
    sendJson(response, 200, { filename });
    return;
  }

  throw new HttpError(404, "API route not found");
}

function requireDatabaseConnection(body) {
  const dialect = body?.dialect;
  if (dialect !== "postgres" && dialect !== "mysql" && dialect !== "sqlite") {
    throw new HttpError(400, "Dialect must be postgres, mysql or sqlite");
  }
  if (dialect === "sqlite") {
    if (typeof body.path !== "string" || !body.path.trim()) throw new HttpError(400, "SQLite path is required");
    return { dialect, path: body.path.trim() };
  }
  const host = requireShortString(body.host, "host");
  const database = requireShortString(body.database, "database");
  const user = requireShortString(body.user, "user");
  const port = Number(body.port ?? (dialect === "postgres" ? 5432 : 3306));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, "Invalid database port");
  return {
    dialect,
    host,
    port,
    database,
    user,
    password: typeof body.password === "string" ? body.password : "",
    ssl: body.ssl === true,
  };
}

function requireShortString(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 255) throw new HttpError(400, `Invalid ${name}`);
  return value.trim();
}

async function introspectPostgres(config) {
  const { Client } = await import("pg");
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
    application_name: "dbml-studio-introspection",
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
    await client.query("ROLLBACK");
    return buildIntrospectedSchema("postgres", config.database, columnsResult.rows, indexesResult.rows, foreignKeysResult.rows);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function introspectMysql(config) {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? {} : undefined,
    connectTimeout: 10_000,
  });
  try {
    const [columns] = await connection.execute(`SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
      COLUMN_NAME AS column_name, COLUMN_TYPE AS data_type, IS_NULLABLE AS is_nullable,
      COLUMN_DEFAULT AS column_default, ORDINAL_POSITION AS ordinal_position, EXTRA AS extra
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [config.database]);
    const [indexes] = await connection.execute(`SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name,
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
    const groupedIndexes = groupMysqlIndexes(indexes);
    return buildIntrospectedSchema("mysql", config.database, columns, groupedIndexes, foreignKeys);
  } finally {
    await connection.end();
  }
}

async function introspectSqlite(config) {
  const candidate = path.resolve(sqliteRoot, config.path);
  if (!isInsideDirectory(sqliteRoot, candidate)) throw new HttpError(403, `SQLite files must be inside ${sqliteRoot}`);
  if (!await isFile(candidate)) throw new HttpError(404, "SQLite database not found");
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(candidate, { readOnly: true });
  try {
    const tableRows = database.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const tables = [];
    for (const tableRow of tableRows) {
      const tableName = String(tableRow.name);
      const quoted = quoteSqliteIdentifier(tableName);
      const columnRows = database.prepare(`PRAGMA table_info(${quoted})`).all();
      const indexRows = database.prepare(`PRAGMA index_list(${quoted})`).all();
      const indexes = indexRows.map((indexRow) => {
        const indexName = String(indexRow.name);
        const columns = database.prepare(`PRAGMA index_info(${quoteSqliteIdentifier(indexName)})`).all()
          .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((item) => String(item.name));
        return { name: indexName, columns, unique: Boolean(indexRow.unique), primary: String(indexRow.origin) === "pk", type: "btree" };
      });
      const primaryColumns = columnRows.filter((column) => Number(column.pk) > 0)
        .sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => String(column.name));
      if (primaryColumns.length > 1 && !indexes.some((index) => index.primary)) {
        indexes.push({ name: `${tableName}_primary`, columns: primaryColumns, unique: true, primary: true, type: "btree" });
      }
      const fkRows = database.prepare(`PRAGMA foreign_key_list(${quoted})`).all();
      const foreignKeys = groupSqliteForeignKeys(fkRows);
      const tableSql = String(tableRow.sql ?? "");
      tables.push({
        schema: "main",
        name: tableName,
        columns: columnRows.sort((a, b) => Number(a.cid) - Number(b.cid)).map((column) => ({
          name: String(column.name),
          type: String(column.type || "text"),
          nullable: !column.notnull && !column.pk,
          defaultValue: column.dflt_value === null ? undefined : String(column.dflt_value),
          primaryKey: primaryColumns.length === 1 && Boolean(column.pk),
          autoIncrement: primaryColumns.length === 1 && Boolean(column.pk) && /\bAUTOINCREMENT\b/i.test(tableSql),
        })),
        indexes,
        foreignKeys,
      });
    }
    return { dialect: "sqlite", database: path.basename(candidate), tables };
  } finally {
    database.close();
  }
}

function buildIntrospectedSchema(dialect, database, columnRows, indexRows, foreignKeyRows) {
  const tableMap = new Map();
  for (const row of columnRows) {
    const schema = String(row.table_schema ?? database);
    const name = String(row.table_name);
    const key = `${schema}.${name}`;
    if (!tableMap.has(key)) tableMap.set(key, { schema, name, columns: [], indexes: [], foreignKeys: [] });
    tableMap.get(key).columns.push({
      name: String(row.column_name),
      type: formatIntrospectedType(row),
      nullable: String(row.is_nullable).toUpperCase() === "YES",
      defaultValue: row.column_default === null || row.column_default === undefined ? undefined : String(row.column_default),
      primaryKey: false,
      autoIncrement: /auto_increment/i.test(String(row.extra ?? "")) || /nextval\(/i.test(String(row.column_default ?? "")),
    });
  }
  for (const row of indexRows) {
    const table = tableMap.get(`${row.table_schema}.${row.table_name}`);
    if (!table) continue;
    const index = {
      name: String(row.index_name),
      columns: Array.isArray(row.columns) ? row.columns.map(String) : [],
      unique: row.is_unique === true || row.non_unique === 0 || row.non_unique === "0",
      primary: row.is_primary === true || String(row.index_name).toUpperCase() === "PRIMARY",
      type: String(row.index_type ?? "btree").toLowerCase(),
    };
    table.indexes.push(index);
    if (index.primary && index.columns.length === 1) {
      const primaryColumn = table.columns.find((column) => column.name === index.columns[0]);
      if (primaryColumn) primaryColumn.primaryKey = true;
    }
  }
  const groupedFks = groupForeignKeyRows(foreignKeyRows);
  for (const foreignKey of groupedFks) {
    const table = tableMap.get(`${foreignKey.schema}.${foreignKey.table}`);
    if (table) table.foreignKeys.push(foreignKey);
  }
  return { dialect, database, tables: Array.from(tableMap.values()) };
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

function groupForeignKeyRows(rows) {
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

function formatIntrospectedType(row) {
  if (row.data_type && /\(/.test(String(row.data_type))) return String(row.data_type);
  const base = String(row.udt_name ?? row.data_type ?? "text");
  if (row.character_maximum_length) return `${base}(${row.character_maximum_length})`;
  if (row.numeric_precision && row.numeric_scale) return `${base}(${row.numeric_precision},${row.numeric_scale})`;
  return base;
}

function quoteSqliteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function listDiagrams() {
  await migrateLegacySaves();
  await mkdir(savesDir, { recursive: true });
  const entries = await readdir(savesDir, { withFileTypes: true });
  const diagrams = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const directory = path.join(savesDir, entry.name);
    const dbmlPath = path.join(directory, "diagram.dbml");
    try {
      const [dbml, dbmlStats, uiLayout, preview, wiki, wikiDocument, wikiStats, wikiDocumentStats] = await Promise.all([
        readFile(dbmlPath, "utf8"),
        stat(dbmlPath),
        readFile(path.join(directory, "ui.json"), "utf8").catch(() => undefined),
        readFile(path.join(directory, "preview.webp")).catch(() => undefined),
        readFile(path.join(directory, "wiki.md"), "utf8").catch(() => undefined),
        readFile(path.join(directory, "wiki.json"), "utf8").catch(() => undefined),
        stat(path.join(directory, "wiki.md")).catch(() => undefined),
        stat(path.join(directory, "wiki.json")).catch(() => undefined),
      ]);
      return {
        filename: `${entry.name}.dbml`,
        name: entry.name.replace(/-/g, " "),
        dbml,
        wiki,
        wikiDocument,
        uiLayout,
        previewDataUrl: preview ? `data:image/webp;base64,${preview.toString("base64")}` : undefined,
        updatedAt: Math.max(dbmlStats.mtimeMs, wikiStats?.mtimeMs ?? 0, wikiDocumentStats?.mtimeMs ?? 0),
      };
    } catch {
      return undefined;
    }
  }));
  return diagrams.filter((diagram) => diagram !== undefined);
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(distDir, relativePath || "index.html");
  if (!isInsideDirectory(distDir, candidate)) throw new HttpError(403, "Forbidden");

  const filePath = await isFile(candidate) ? candidate : path.join(distDir, "index.html");
  const fileStats = await stat(filePath).catch(() => undefined);
  if (!fileStats?.isFile()) throw new HttpError(404, "Static build not found");

  const extension = path.extname(filePath).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypes.get(extension) ?? "application/octet-stream");
  response.setHeader("Content-Length", fileStats.size);
  response.setHeader(
    "Cache-Control",
    path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
  );
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).on("error", (error) => response.destroy(error)).pipe(response);
}

async function ensureStorage() {
  await mkdir(savesDir, { recursive: true });
  await migrateLegacySaves();
}

async function assertStaticBuild() {
  if (!await isFile(path.join(distDir, "index.html"))) {
    throw new Error(`Static build not found at ${distDir}. Run npm run build first.`);
  }
}

async function migrateLegacySaves() {
  const entries = await readdir(legacyDir).catch(() => []);
  const filenames = entries.filter((entry) => entry.endsWith(".dbml"));
  await Promise.all(filenames.map(async (filename) => {
    const target = saveDirectory(filename);
    await mkdir(target, { recursive: true });
    await rename(path.join(legacyDir, filename), path.join(target, "diagram.dbml")).catch(() => undefined);
    await rename(path.join(legacyDir, `${filename}.ui.json`), path.join(target, "ui.json")).catch(() => undefined);
    await rename(path.join(legacyDir, `${filename}.preview.webp`), path.join(target, "preview.webp")).catch(() => undefined);
  }));
}

function saveDirectory(filename) {
  return path.join(savesDir, filename.replace(/\.dbml$/i, ""));
}

function requireFilename(value) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "Invalid filename");
  const cleaned = value
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) throw new HttpError(400, "Invalid filename");
  const filename = cleaned.toLowerCase().endsWith(".dbml") ? cleaned : `${cleaned}.dbml`;
  const stem = filename.replace(/\.dbml$/i, "");
  if (!stem || stem === "." || stem === "..") throw new HttpError(400, "Invalid filename");
  return filename;
}

function isStructuredWikiDocument(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    value.version === 2 && Boolean(value.project) && typeof value.project === "object" &&
    !Array.isArray(value.project) && Array.isArray(value.tables) &&
    (value.archivedTables === undefined || Array.isArray(value.archivedTables)) &&
    (value.customSections === undefined || Array.isArray(value.customSections)) &&
    (value.options === undefined ||
      (Boolean(value.options) && typeof value.options === "object" && !Array.isArray(value.options)));
}

async function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJsonBody(request, limit) {
  const declaredLength = Number.parseInt(request.headers["content-length"] ?? "0", 10);
  if (declaredLength > limit) throw new HttpError(413, "Payload too large");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Payload too large");
    chunks.push(chunk);
  }
  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON payload");
  }
}

async function isFile(filePath) {
  return stat(filePath).then((value) => value.isFile()).catch(() => false);
}

async function isDirectory(directoryPath) {
  return stat(directoryPath).then((value) => value.isDirectory()).catch(() => false);
}

function isInsideDirectory(directory, candidate) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, statusCode, body, headOnly = false) {
  const payload = Buffer.from(JSON.stringify(body));
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", payload.length);
  response.setHeader("Cache-Control", "no-store");
  response.end(headOnly ? undefined : payload);
}

function parseByteLimit(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
