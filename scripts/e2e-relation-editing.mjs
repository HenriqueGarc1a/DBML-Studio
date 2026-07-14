import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const host = "127.0.0.1";
const appPort = 4173;
const debugPort = 9333;
const appUrl = `http://${host}:${appPort}/editor/${encodeURIComponent("file:relation-e2e.dbml")}`;
const tempRoot = path.join("/tmp", `dbml-studio-relation-e2e-${process.pid}`);
const saveRoot = path.join(tempRoot, "saves");
const profileRoot = path.join(tempRoot, "chrome-profile");
let vite;
let chrome;
let cdp;

class CdpClient {
  static async connect(url) {
    const client = new CdpClient(new WebSocket(url));
    await new Promise((resolve, reject) => {
      client.socket.addEventListener("open", resolve, { once: true });
      client.socket.addEventListener("error", reject, { once: true });
    });
    return client;
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

try {
  await createFixture(saveRoot);
  createSqliteFixture(path.join(saveRoot, "dev.sqlite"));
  vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", host, "--port", String(appPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DBML_SAVES_DIR: saveRoot,
      DBML_LEGACY_DIR: path.join(tempRoot, "legacy"),
      DBML_SQLITE_ROOT: saveRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHttp(`http://${host}:${appPort}`);
  const introspection = await fetch(`http://${host}:${appPort}/__dbml/introspect`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dialect: "sqlite", path: "dev.sqlite" }),
  });
  if (!introspection.ok) throw new Error(`middleware de introspecção retornou ${introspection.status}: ${await introspection.text()}`);
  const devSchema = (await introspection.json()).schema;
  assert(devSchema.tables.some((table) => table.name === "dev_check"), "middleware de desenvolvimento não introspectou SQLite");

  chrome = spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileRoot}`,
    "--window-size=1440,900",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForHttp(`http://${host}:${debugPort}/json/version`);
  const target = await fetch(`http://${host}:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" }).then((response) => response.json());
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.bringToFront");
  await waitForExpression("Boolean(document.querySelector('[data-testid=diagram-canvas]') && document.querySelector('[data-testid=relation-segment]'))", 15_000);

  await testSelectionAndHover();
  await testEndpointSideDrag();
  await testFreeMidpointAndSingleUndo();
  await testCornerPointMovement();
  await testTableExitAlignment();
  await testCrossingThroughObstacle();
  await testObstacleFeedback();

  console.log("✓ Chrome real: clique seleciona sem mover");
  console.log("✓ Vite dev: introspecção SQLite disponível no mesmo endpoint do runtime");
  console.log("✓ Chrome real: hover não cria uma linha fantasma");
  console.log("✓ Chrome real: extremidade troca o lado de encaixe ao atravessar a tabela");
  console.log("✓ Chrome real: ponto intermediário cria uma âncora livre e aplica grid apenas ao soltar");
  console.log("✓ Chrome real: ponto de curva acompanha o cursor em dois eixos");
  console.log("✓ Chrome real: ponto dá snap na altura exata da saída da tabela");
  console.log("✓ Chrome real: ponto atravessa a tabela com segurança e é liberado no outro lado válido");
  console.log("✓ Chrome real: obstáculo mostra feedback e mantém a rota segura");
  console.log("✓ Chrome real: um único Ctrl+Z restaura o gesto completo");
} catch (error) {
  if (cdp) {
    await cdp.send("Page.captureScreenshot", { format: "png" })
      .then(({ data }) => writeFile(path.join("/tmp", "dbml-studio-relation-e2e-failure.png"), Buffer.from(data, "base64")))
      .catch(() => undefined);
  }
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome?.kill("SIGTERM");
  vite?.kill("SIGTERM");
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function testSelectionAndHover() {
  const initial = await routePoints();
  const segment = longestEditableSegment(initial, "horizontal");
  const middle = midpoint(initial[segment], initial[segment + 1]);
  const client = await svgToClient(middle);

  await mouse("mouseMoved", client);
  assert(await count("[data-testid=relation-segment-highlight]") === 0, "hover criou uma linha fantasma");

  await mouse("mousePressed", client, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", client, { button: "left", buttons: 0, clickCount: 1 });
  await waitForExpression("document.querySelector('.relation-path')?.classList.contains('is-selected')");
  assert(samePoints(initial, await routePoints()), "um clique simples alterou a relação");
  assert(await evaluate("document.querySelector('button[title=Desfazer]')?.disabled === true"), "um clique simples criou histórico");

  await mouse("mousePressed", client, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseMoved", { x: client.x + 3, y: client.y + 1 }, { buttons: 1 });
  await mouse("mouseReleased", { x: client.x + 3, y: client.y + 1 }, { button: "left", buttons: 0, clickCount: 1 });
  assert(samePoints(initial, await routePoints()), "movimento abaixo do limiar alterou a relação");
}

async function testFreeMidpointAndSingleUndo() {
  const initial = await routePoints();
  const segment = longestEditableSegment(initial, "horizontal");
  const a = initial[segment];
  const b = initial[segment + 1];
  const grab = midpoint(a, b);
  const start = await svgToClient(grab);
  const requested = { x: grab.x + 18.5, y: grab.y - 19.5 };
  const previewTarget = await svgToClient(requested);

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, previewTarget, 5);
  await waitForExpression("document.querySelector('.relation-path')?.dataset.dragState === 'dragging'");
  const preview = await routePoints();
  assert(preview.length > initial.length, "arrastar o ponto intermediário não criou uma nova âncora");
  assert(preview.some((point) => Math.abs(point.x - requested.x) < 0.75 && Math.abs(point.y - requested.y) < 0.75), "o ponto intermediário não acompanhou o cursor livremente");

  await mouse("mouseReleased", previewTarget, { button: "left", buttons: 0, clickCount: 1 });
  await waitForExpression("document.querySelector('.relation-path')?.dataset.dragState === 'idle'");
  const committed = await routePoints();
  const snapped = { x: Math.round(requested.x / 32) * 32, y: Math.round(requested.y / 32) * 32 };
  assert(committed.some((point) => Math.abs(point.x - snapped.x) < 0.75 && Math.abs(point.y - snapped.y) < 0.75), "o snap não foi aplicado no soltamento");

  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
  assert(samePoints(initial, await routePoints()), "um Ctrl+Z não restaurou toda a edição");
}

async function testEndpointSideDrag() {
  const initial = await routePoints();
  assert(await count('[data-testid=relation-endpoint-handle][data-endpoint="from"]') === 1, "ponto de encaixe da origem não apareceu");
  const start = await svgToClient(initial[0]);
  const target = await svgToClient({ x: 70, y: initial[0].y });

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, target, 8);
  const preview = await routePoints();
  assert(Math.abs(preview[0].x - 40) < 0.1, "arrastar através da tabela não mudou o encaixe para a esquerda");
  await mouse("mouseReleased", target, { button: "left", buttons: 0, clickCount: 1 });
  await waitForExpression("document.querySelector('[data-testid=relation-endpoint-handle][data-endpoint=from]')?.dataset.side === 'west'");
  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
}

async function testCornerPointMovement() {
  const initial = await routePoints();
  const pointIndex = 2;
  const original = initial[pointIndex];
  assert(await count(`[data-testid=relation-corner-handle][data-point-index="${pointIndex}"]`) === 1, "ponto de curva não foi encontrado");
  const start = await svgToClient(original);
  const targetPoint = { x: original.x - 10, y: original.y - 24 };
  const target = await svgToClient(targetPoint);

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, target, 5);
  const preview = await routePoints();
  assert(preview.some((point) => Math.abs(point.x - targetPoint.x) < 1.25 && Math.abs(point.y - targetPoint.y) < 1.25), "ponto de curva não acompanhou o cursor em dois eixos");
  await mouse("mouseReleased", target, { button: "left", buttons: 0, clickCount: 1 });
  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
}

async function testObstacleFeedback() {
  const initial = await routePoints();
  const segment = longestEditableSegment(initial, "horizontal");
  const middle = midpoint(initial[segment], initial[segment + 1]);
  const start = await svgToClient(middle);
  const blockedTarget = await svgToClient({ x: middle.x, y: 110 });

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, blockedTarget, 8);
  await waitForExpression("document.querySelector('.relation-path')?.dataset.blocked === 'true'");
  assert(await count("[data-testid=relation-edit-feedback]") === 1, "feedback de bloqueio não apareceu");
  assert(await evaluate("document.querySelector('[data-table-id=blocker]')?.dataset.routeObstacle === 'true'"), "tabela bloqueadora não foi destacada");

  const preview = await routePoints();
  assert(!routeCrossesExpandedTable(preview, { left: 319, top: 9, right: 561, bottom: 291 }), "a prévia atravessou a margem protegida");
  await mouse("mouseReleased", blockedTarget, { button: "left", buttons: 0, clickCount: 1 });
  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
}

async function testTableExitAlignment() {
  const initial = await routePoints();
  const start = await svgToClient(initial[1]);
  const target = await svgToClient({ x: initial[1].x - 10, y: initial[0].y + 5 });

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, target, 5);
  await waitForExpression("Boolean(document.querySelector('[data-testid=relation-snap-guides]'))");
  const snapY = await evaluate("Number(document.querySelector('.relation-snap-point')?.getAttribute('cy'))");
  assert(Math.abs(snapY - initial[0].y) < 0.1, "o ponto não alinhou à saída do campo conectado");
  await mouse("mouseReleased", target, { button: "left", buttons: 0, clickCount: 1 });
  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
}

async function testCrossingThroughObstacle() {
  const initial = await routePoints();
  const pointIndex = 2;
  const start = await svgToClient(initial[pointIndex]);
  const blocker = await tableBounds("blocker");
  const desired = { x: blocker.right + 70, y: (blocker.top + blocker.bottom) / 2 };
  const target = await svgToClient(desired);

  await mouse("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
  await dragMouse(start, target, 12);
  await waitForExpression("document.querySelector('.relation-path')?.dataset.dragState === 'dragging'");
  assert(await evaluate("document.querySelector('.relation-path')?.dataset.blocked === 'false'"), "a linha continuou presa depois que o cursor saiu da tabela");
  const preview = await routePoints();
  assert(preview.some((point) => Math.abs(point.x - desired.x) < 0.75 && Math.abs(point.y - desired.y) < 0.75), "o caminho não alcançou o ponto válido no outro lado da tabela");
  assert(!routeCrossesExpandedTable(preview, { left: blocker.left - 29, top: blocker.top - 29, right: blocker.right + 29, bottom: blocker.bottom + 29 }), "o caminho recalculado atravessou a margem da tabela");
  await mouse("mouseReleased", target, { button: "left", buttons: 0, clickCount: 1 });
  await keyChord("z", true, false);
  await waitUntil(async () => samePoints(initial, await routePoints()));
}

async function routePoints() {
  return evaluate("JSON.parse(document.querySelector('.relation-path').dataset.routePoints)");
}

async function tableBounds(id) {
  return evaluate(`(() => {
    const group = document.querySelector('[data-table-id=${id}]');
    const rect = group?.querySelector('rect');
    const matrix = group?.transform.baseVal.consolidate()?.matrix;
    if (!rect || !matrix) return undefined;
    const left = matrix.e; const top = matrix.f;
    return { left, top, right: left + Number(rect.getAttribute('width')), bottom: top + Number(rect.getAttribute('height')) };
  })()`);
}

async function svgToClient(point) {
  return evaluate(`(() => {
    const svg = document.querySelector('[data-testid=diagram-canvas]');
    const p = svg.createSVGPoint(); p.x = ${point.x}; p.y = ${point.y};
    const result = p.matrixTransform(svg.getScreenCTM());
    return { x: result.x, y: result.y };
  })()`);
}

async function dragMouse(start, target, steps) {
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    await mouse("mouseMoved", {
      x: start.x + (target.x - start.x) * ratio,
      y: start.y + (target.y - start.y) * ratio,
    }, { buttons: 1 });
  }
}

async function mouse(type, point, extra = {}) {
  await cdp.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, ...extra });
}

async function keyChord(key, control, shift) {
  const modifiers = (control ? 2 : 0) | (shift ? 8 : 0);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: `Key${key.toUpperCase()}`, modifiers });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: `Key${key.toUpperCase()}`, modifiers });
}

async function count(selector) {
  return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(expression, timeout = 5_000) {
  return waitUntil(async () => Boolean(await evaluate(expression)), timeout);
}

async function waitUntil(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(35);
  }
  throw new Error("Tempo esgotado aguardando condição do navegador");
}

function longestEditableSegment(points, orientation) {
  let best = { index: -1, length: -1 };
  for (let index = 1; index < points.length - 2; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const candidateOrientation = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? "horizontal" : "vertical";
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (candidateOrientation === orientation && length > best.length) best = { index, length };
  }
  if (best.index < 0) throw new Error(`Nenhum trecho ${orientation} editável encontrado`);
  return best.index;
}

function routeCrossesExpandedTable(points, box) {
  return points.slice(0, -1).some((a, index) => {
    const b = points[index + 1];
    if (Math.abs(a.x - b.x) < 0.01) {
      return a.x > box.left && a.x < box.right && Math.min(a.y, b.y) < box.bottom && Math.max(a.y, b.y) > box.top;
    }
    return a.y > box.top && a.y < box.bottom && Math.min(a.x, b.x) < box.right && Math.max(a.x, b.x) > box.left;
  });
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function samePoints(a, b) {
  return a.length === b.length && a.every((point, index) =>
    Math.abs(point.x - b[index].x) < 0.01 && Math.abs(point.y - b[index].y) < 0.01,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHttp(url, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await delay(80);
  }
  throw new Error(`Serviço não iniciou: ${url}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createFixture(root) {
  const folder = path.join(root, "relation-e2e");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "diagram.dbml"), `Table child {
  id int [pk]
  parent_id int [not null]
}

Table parent {
  id int [pk]
}

Table blocker {
  id int [pk]
}

Ref: child.parent_id > parent.id
`, "utf8");

  const tableVisual = {
    backgroundColor: "#111827", borderColor: "#4b5f78", textColor: "#e5edf7",
    headerColor: "#253142", lineColor: "#94a3b8", opacity: 1,
  };
  const tables = [
    tableLayout("child", 40, 100, 220, 94, tableVisual),
    tableLayout("parent", 700, 100, 220, 66, tableVisual),
    tableLayout("blocker", 350, 40, 180, 220, tableVisual),
  ];
  const relation = {
    id: "relation-child-parent", fromTable: "child", fromColumn: "parent_id", toTable: "parent", toColumn: "id",
    fromSide: "east", toSide: "west", sideMode: "manual", route: "orthogonal",
    viaPoints: [{ x: 300, y: 180 }, { x: 300, y: 0 }, { x: 650, y: 0 }, { x: 650, y: 152 }],
    color: "#94a3b8", usesTableLineColor: true, opacity: 0.9, strokeWidth: 4, style: "solid",
    fromCardinality: "many", toCardinality: "one", label: "",
  };
  const visual = {
    backgroundColor: "#0f172a", gridColor: "#1f2a3a", gridSize: 32, tableRouteMargin: 28,
    defaultTable: tableVisual,
    badges: {
      primaryKey: { backgroundColor: "#3f2d12", borderColor: "#f59e0b", textColor: "#fcd34d" },
      foreignKey: { backgroundColor: "#12312e", borderColor: "#2dd4bf", textColor: "#99f6e4" },
      notNull: { backgroundColor: "#3b1620", borderColor: "#fb7185", textColor: "#fecdd3" },
      unique: { backgroundColor: "#1e1b4b", borderColor: "#818cf8", textColor: "#c7d2fe" },
    },
    savedColors: [],
  };
  await writeFile(path.join(folder, "ui.json"), JSON.stringify({ version: 1, visual, tables, relations: [relation], groups: [] }), "utf8");
}

function createSqliteFixture(filename) {
  const database = new DatabaseSync(filename);
  database.exec("CREATE TABLE dev_check (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
  database.close();
}

function tableLayout(id, x, y, width, height, visual) {
  return {
    id, name: id, x, y, width, height, visual,
    usesDefaultStyle: true, usesGroupStyle: false, layoutSource: "manual",
    columnOrder: id === "child" ? ["id", "parent_id"] : ["id"],
  };
}
