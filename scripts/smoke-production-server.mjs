import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const tempRoot = path.join("/tmp", `dbml-studio-production-smoke-${process.pid}`);
const savesDir = path.join(tempRoot, "saves");
let child;

try {
  await mkdir(savesDir, { recursive: true });
  let runtime = await startServer();
  child = runtime.child;

  const health = await fetch(`${runtime.origin}/health`);
  assert(health.ok, "healthcheck falhou");
  assert(health.headers.get("x-content-type-options") === "nosniff", "headers de segurança ausentes");

  const deepRoute = await fetch(`${runtime.origin}/editor/${encodeURIComponent("file:alpha.dbml")}/wiki`);
  assert(deepRoute.ok && (await deepRoute.text()).includes('id="root"'), "fallback do BrowserRouter falhou");

  for (const filename of [".dbml", "..dbml", "...dbml"]) {
    const maliciousDelete = await post(runtime.origin, "/__dbml/delete", { filename });
    assert(maliciousDelete.status === 400, `nome perigoso foi aceito: ${filename}`);
  }
  assert((await stat(savesDir)).isDirectory(), "a raiz de saves foi removida");

  const invalidJson = await fetch(`${runtime.origin}/__dbml/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert(invalidJson.status === 400, "JSON inválido não retornou 400");

  await expectOk(post(runtime.origin, "/__dbml/save", {
    filename: "alpha.dbml",
    contents: "Table alpha {\n  id int [pk]\n}\n",
    uiLayout: JSON.stringify({ version: 1, tables: [] }),
    previewDataUrl: `data:image/webp;base64,${Buffer.from("preview-alpha").toString("base64")}`,
  }), "salvar alpha");
  await expectOk(post(runtime.origin, "/__dbml/save", {
    filename: "beta.dbml",
    contents: "Table beta {\n  id int [pk]\n}\n",
  }), "salvar beta");
  await expectOk(post(runtime.origin, "/__dbml/wiki", {
    filename: "alpha.dbml",
    contents: "# Wiki Alpha\n\nConteúdo persistente.",
    document: JSON.stringify(wikiDocumentFixture()),
  }), "salvar Wiki");

  const invalidWikiDocument = await post(runtime.origin, "/__dbml/wiki", {
    filename: "alpha.dbml",
    contents: "# Conteúdo que não deve substituir a Wiki",
    document: "{invalid",
  });
  assert(invalidWikiDocument.status === 400, "wiki.json inválido não retornou 400");

  let files = await list(runtime.origin);
  assert(files.length === 2, "listagem não retornou os dois projetos");
  const alpha = files.find((item) => item.filename === "alpha.dbml");
  assert(alpha?.wiki.includes("Conteúdo persistente"), "Wiki não apareceu na listagem");
  assert(JSON.parse(alpha?.wikiDocument ?? "{}").version === 2, "documento estruturado da Wiki não apareceu na listagem");
  assert((await readFile(path.join(savesDir, "alpha", "wiki.md"), "utf8")).includes("Conteúdo persistente"), "wiki.md não foi gravado na pasta do projeto");
  assert(JSON.parse(await readFile(path.join(savesDir, "alpha", "wiki.json"), "utf8")).project.title === "Wiki Alpha", "wiki.json não foi gravado na pasta do projeto");
  assert(alpha?.previewDataUrl.startsWith("data:image/webp;base64,"), "preview não foi persistido");

  const duplicateRename = await post(runtime.origin, "/__dbml/rename", { from: "alpha.dbml", to: "beta.dbml" });
  assert(duplicateRename.status === 409, "rename sobre um projeto existente não foi bloqueado");
  await expectOk(post(runtime.origin, "/__dbml/rename", { from: "alpha.dbml", to: "renamed.dbml" }), "renomear");

  const oversized = await post(runtime.origin, "/__dbml/save", {
    filename: "large.dbml",
    contents: "x".repeat(6_000),
  });
  assert(oversized.status === 413, "payload acima do limite não retornou 413");

  await stopServer(child);
  child = undefined;
  runtime = await startServer();
  child = runtime.child;

  files = await list(runtime.origin);
  const renamed = files.find((item) => item.filename === "renamed.dbml");
  assert(renamed?.wiki.includes("Conteúdo persistente"), "Wiki não sobreviveu ao reinício/rename");
  assert(JSON.parse(renamed?.wikiDocument ?? "{}").project.title === "Wiki Alpha", "wiki.json não sobreviveu ao reinício/rename");
  assert(files.some((item) => item.filename === "beta.dbml"), "segundo projeto se perdeu no reinício");

  await expectOk(post(runtime.origin, "/__dbml/delete", { filename: "renamed.dbml" }), "excluir");
  files = await list(runtime.origin);
  assert(files.length === 1 && files[0].filename === "beta.dbml", "delete afetou o projeto errado");

  console.log("✓ runtime: healthcheck e headers de segurança");
  console.log("✓ runtime: fallback de rotas do React Router");
  console.log("✓ runtime: save/list/wiki.json+wiki.md/rename/delete e preview");
  console.log("✓ runtime: persistência após reinício");
  console.log("✓ runtime: nomes perigosos, conflito, JSON inválido e limite de payload bloqueados");
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (child) await stopServer(child).catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function startServer() {
  const server = spawn(process.execPath, ["scripts/production-server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      STATIC_DIR: path.join(root, "dist"),
      DBML_SAVES_DIR: savesDir,
      DBML_LEGACY_DIR: path.join(tempRoot, "legacy"),
      MAX_BODY_BYTES: "4096",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => { stderr += chunk; });

  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`runtime não iniciou: ${stderr}`)), 10_000);
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(`http://127.0.0.1:${match[1]}`);
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`runtime encerrou com código ${code}: ${stderr}`));
    });
  });
  return { child: server, origin };
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await once(server, "exit");
}

async function list(origin) {
  const response = await fetch(`${origin}/__dbml/list`);
  assert(response.ok, `listagem retornou ${response.status}`);
  return (await response.json()).files;
}

function post(origin, pathname, body) {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectOk(responsePromise, operation) {
  const response = await responsePromise;
  assert(response.ok, `${operation} retornou ${response.status}: ${await response.text()}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wikiDocumentFixture() {
  return {
    version: 2,
    project: {
      title: "Wiki Alpha",
      summary: "Documentação persistente.",
      introduction: "",
      overview: "",
      conclusion: "",
    },
    tables: [],
    archivedTables: [],
    customSections: [],
    options: {
      includeToc: true,
      includeEnums: true,
      includeRelationships: true,
    },
  };
}
