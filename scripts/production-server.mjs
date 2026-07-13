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
