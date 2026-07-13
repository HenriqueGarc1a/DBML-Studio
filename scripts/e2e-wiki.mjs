import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const host = "127.0.0.1";
const appPort = 4174;
const debugPort = 9334;
const projectId = "file:wiki-e2e.dbml";
const tempRoot = path.join("/tmp", `dbml-studio-wiki-e2e-${process.pid}`);
const saveRoot = path.join(tempRoot, "saves");
const downloadRoot = path.join(tempRoot, "downloads");
const profileRoot = path.join(tempRoot, "chrome-profile");
const appUrl = `http://${host}:${appPort}/editor/${encodeURIComponent(projectId)}/wiki`;
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
  await mkdir(downloadRoot, { recursive: true });
  vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", host, "--port", String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, DBML_SAVES_DIR: saveRoot, DBML_LEGACY_DIR: path.join(tempRoot, "legacy") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHttp(`http://${host}:${appPort}`);
  const rejectedOrphan = await fetch(`http://${host}:${appPort}/__dbml/wiki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "sem-diagrama.dbml", contents: "# Órfã" }),
  });
  assert(!rejectedOrphan.ok, "a API aceitou uma Wiki sem o DBML do projeto");
  const rejectedRootDelete = await fetch(`http://${host}:${appPort}/__dbml/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: ".dbml" }),
  });
  assert(rejectedRootDelete.status === 400, "a API aceitou um nome que apontava para a raiz de saves");
  const listedAfterOrphan = await fetch(`http://${host}:${appPort}/__dbml/list`).then((response) => response.json());
  assert(listedAfterOrphan.files.length === 1, "uma pasta incompleta derrubou a listagem de projetos");

  chrome = spawn("google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileRoot}`,
    "--window-size=1600,960",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForHttp(`http://${host}:${debugPort}/json/version`);
  const target = await fetch(`http://${host}:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" }).then((response) => response.json());
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadRoot });
  await cdp.send("Page.bringToFront");
  await waitForBuilder(15_000);

  assert(await evaluate("document.querySelector('.active-diagram-name span')?.textContent") === "wiki e2e", "a wiki não abriu o projeto correto");
  assert(await evaluate("document.querySelector('.project-tab.is-active')?.textContent.trim()") === "Wiki", "a aba Wiki não ficou ativa");
  await waitForExpression("Boolean(document.querySelector('.wiki-save-state.is-saved'))", 10_000);
  await waitForPersistedWiki((markdown, document) => (
    markdown.includes("# Dicionário de Dados") && document.version === 2 && document.tables.length === 2
  ), 10_000);

  await clickBuilderTable("customers");
  await waitForExpression("document.querySelector('.wiki-builder-table-heading h2')?.textContent === 'customers'");
  await setBuilderField("Responsabilidade da tabela", "Cadastro principal dos clientes da plataforma.");
  await setColumnDescription("email", "Endereço único usado para contato e autenticação.");
  await clickByText("button", "Adicionar primeira regra");
  await setRuleText("O e-mail do cliente deve permanecer único no sistema.");

  await clickByText("button", "Adicionar seção");
  await waitForExpression("Boolean(document.querySelector('.wiki-builder-custom-heading'))");
  await setBuilderField("Título", "Notas de operação");
  await setBuilderField("Conteúdo", "Este trecho precisa ser preservado no Markdown final.");

  await clickByText("button", "Visualizar");
  await waitForExpression("Boolean(document.querySelector('.wiki-preview-dialog'))");
  assert(await evaluate("document.querySelector('.wiki-preview-dialog .wiki-preview-scroll')?.clientHeight > 400"), "o documento ficou espremido e sem área útil no preview");
  assert(await count(".wiki-preview-dialog .wiki-preview-content table") >= 2, "as tabelas Markdown não apareceram no preview secundário");
  assert((await evaluate("document.querySelector('.wiki-preview-dialog .wiki-preview-content')?.textContent"))?.includes("Notas de operação"), "a seção visual não apareceu no documento renderizado");
  await clickByText("button", "Markdown");
  await waitForExpression("Boolean(document.querySelector('textarea.wiki-generated-markdown'))");
  const generated = await evaluate("document.querySelector('textarea.wiki-generated-markdown').value");
  assert(generated.includes("| Campo | Tipo | Descrição | Restrição |"), "o dicionário não foi gerado no Markdown");
  assert(generated.includes("`customer_id`"), "os campos do esquema não foram documentados");
  assert(generated.includes("FK → `customers.id`<br>NOT NULL"), "a restrição de FK não foi descrita");
  assert(generated.includes("referencia `customers.id`"), "o destino da relação não foi descrito");
  assert(generated.includes("Endereço único usado para contato"), "a descrição visual do campo não chegou ao Markdown");
  assert(generated.includes("O e-mail do cliente deve permanecer único"), "a regra visual não chegou ao Markdown");
  assert(!generated.toLowerCase().includes("modelo conceitual"), "a seção conceitual deveria ter sido ignorada");
  await clickByAriaLabel("Fechar visualização");

  await waitForPersistedWiki((markdown, document) => {
    const customers = document.tables.find((table) => table.binding.name === "customers");
    const email = customers?.fields.find((field) => field.binding.name === "email");
    return markdown.includes("Este trecho precisa ser preservado no Markdown final.") &&
      email?.description === "Endereço único usado para contato e autenticação." &&
      customers?.businessRules.some((rule) => rule.text.includes("permanecer único"));
  }, 10_000);

  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    let failNextWikiSave = true;
    window.fetch = (...args) => {
      if (failNextWikiSave && String(args[0]).includes('/__dbml/wiki')) {
        failNextWikiSave = false;
        return Promise.resolve(new Response('', { status: 503 }));
      }
      return originalFetch(...args);
    };
  })()`);
  await clickByText("button", "Apresentação");
  await setBuilderField("Introdução", "Salvamento visual deve tentar novamente após uma falha temporária.");
  await waitForExpression("Boolean(document.querySelector('.wiki-save-state.is-local'))", 5_000);
  await clickByText("button", "Salvar");
  await waitForExpression("Boolean(document.querySelector('.wiki-save-state.is-saved'))", 5_000);
  await waitForPersistedWiki((markdown, document) => (
    markdown.includes("Salvamento visual deve tentar novamente") &&
    document.project.introduction.includes("falha temporária")
  ), 5_000);

  await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
    .then(({ data }) => writeFile("/tmp/dbml-studio-wiki-e2e.png", Buffer.from(data, "base64")));

  await clickByText("button", "Baixar .md");
  await waitUntil(async () => (await readdir(downloadRoot)).some((name) => name.endsWith("-wiki.md")), 5_000);
  const downloadedName = (await readdir(downloadRoot)).find((name) => name.endsWith("-wiki.md"));
  const downloaded = await readFile(path.join(downloadRoot, downloadedName), "utf8");
  assert(downloaded.includes("Este trecho precisa ser preservado no Markdown final."), "o .md baixado não contém a edição visual atual");
  assert(downloaded.includes("Endereço único usado para contato"), "o .md baixado não contém a documentação de campo");

  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    let delayNextWikiSave = true;
    window.fetch = (...args) => {
      const url = String(args[0]);
      if (delayNextWikiSave && url.includes('/__dbml/wiki')) {
        delayNextWikiSave = false;
        return new Promise((resolve, reject) => setTimeout(() => originalFetch(...args).then(resolve, reject), 700));
      }
      return originalFetch(...args);
    };
  })()`);
  await setBuilderField("Resumo inicial", "Primeira versão do teste de concorrência.");
  await delay(950);
  await setBuilderField("Introdução", "Texto final escrito durante o salvamento concorrente.");
  await clickByText("button", "Diagrama");
  await waitForExpression("Boolean(document.querySelector('[data-testid=diagram-canvas]'))", 10_000);
  await clickByText("button", "Menu");
  await waitForExpression("Boolean(document.querySelector('.diagram-card-wiki'))", 10_000);
  await clickByText("button", "Wiki");
  await waitForBuilder(10_000);
  await clickByText("button", "Apresentação");
  await waitForExpression("[...document.querySelectorAll('.wiki-builder-field')].some((label) => label.querySelector('strong')?.textContent.trim() === 'Introdução' && label.querySelector('textarea')?.value.includes('Texto final escrito durante o salvamento concorrente.'))", 10_000);
  const finalWiki = await readFile(path.join(saveRoot, "wiki-e2e", "wiki.md"), "utf8");
  const finalDocument = JSON.parse(await readFile(path.join(saveRoot, "wiki-e2e", "wiki.json"), "utf8"));
  assert(finalWiki.includes("Texto final escrito durante o salvamento concorrente."), "uma resposta antiga sobrescreveu o Markdown mais novo");
  assert(finalDocument.project.introduction.includes("Texto final escrito durante"), "uma resposta antiga sobrescreveu o wiki.json mais novo");

  console.log("✓ Chrome real: Wiki abre vinculada ao projeto e a aba correta fica ativa");
  console.log("✓ Chrome real: formulários documentam tabela, campo, regra de negócio e seção livre");
  console.log("✓ Chrome real: preview e Markdown são saídas secundárias geradas pela UI");
  console.log("✓ Chrome real: modelo conceitual é omitido nesta versão");
  console.log("✓ Chrome real: autosave grava saves/<projeto>/wiki.json e wiki.md coerentes");
  console.log("✓ Chrome real: falha local é sinalizada e Salvar tenta sincronizar novamente");
  console.log("✓ Chrome real: download .md contém a versão visual atual");
  console.log("✓ Chrome real: navegação Diagrama → Menu → Wiki recupera os campos persistidos");
  console.log("✓ Chrome real: salvamentos concorrentes preservam sempre a edição mais nova");
} catch (error) {
  if (cdp) {
    await cdp.send("Page.captureScreenshot", { format: "png" })
      .then(({ data }) => writeFile("/tmp/dbml-studio-wiki-e2e-failure.png", Buffer.from(data, "base64")))
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

async function createFixture(root) {
  const folder = path.join(root, "wiki-e2e");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "diagram.dbml"), `Table customers {
  id uuid [pk, not null]
  email varchar(255) [not null, unique]
}

Table orders {
  id uuid [pk, not null]
  customer_id uuid [not null]
  status varchar(32) [default: 'pending']
}

Ref: orders.customer_id > customers.id
`, "utf8");
  const incomplete = path.join(root, "pasta-incompleta");
  await mkdir(incomplete, { recursive: true });
  await writeFile(path.join(incomplete, "wiki.md"), "# Sem diagrama", "utf8");
}

async function waitForBuilder(timeout = 5_000) {
  return waitForExpression("Boolean(document.querySelector('.wiki-builder-workspace') && !document.querySelector('.wiki-loading'))", timeout);
}

async function waitForPersistedWiki(predicate, timeout = 5_000) {
  return waitUntil(async () => {
    try {
      const markdown = await readFile(path.join(saveRoot, "wiki-e2e", "wiki.md"), "utf8");
      const document = JSON.parse(await readFile(path.join(saveRoot, "wiki-e2e", "wiki.json"), "utf8"));
      return Boolean(predicate(markdown, document));
    } catch {
      return false;
    }
  }, timeout);
}

async function clickBuilderTable(name) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('.wiki-builder-table-nav button')]
      .find((candidate) => candidate.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(name)});
    element?.click();
    return Boolean(element);
  })()`);
  assert(clicked, `tabela não encontrada no construtor: ${name}`);
}

async function setBuilderField(label, value) {
  const changed = await evaluate(`(() => {
    const container = [...document.querySelectorAll('.wiki-builder-field')]
      .find((candidate) => candidate.querySelector(':scope > span > strong')?.textContent.trim() === ${JSON.stringify(label)});
    const element = container?.querySelector('input, textarea');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(changed, `campo visual não encontrado: ${label}`);
}

async function setColumnDescription(columnName, value) {
  const changed = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.wiki-builder-column-card')]
      .find((candidate) => candidate.querySelector('.wiki-builder-column-meta strong')?.textContent.trim() === ${JSON.stringify(columnName)});
    const element = card?.querySelector('textarea');
    if (!element) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(changed, `campo do banco não encontrado no construtor: ${columnName}`);
}

async function setRuleText(value) {
  await waitForExpression("Boolean(document.querySelector('.wiki-builder-rule-list textarea'))");
  const changed = await evaluate(`(() => {
    const element = document.querySelector('.wiki-builder-rule-list textarea');
    if (!element) return false;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  assert(changed, "a regra de negócio não ficou editável");
}

async function clickByText(selector, text) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
    element?.click();
    return Boolean(element);
  })()`);
  assert(clicked, `botão não encontrado: ${text}`);
}

async function clickByAriaLabel(label) {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
    element?.click();
    return Boolean(element);
  })()`);
  assert(clicked, `controle não encontrado: ${label}`);
}

async function count(selector) {
  return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitForExpression(expression, timeout = 5_000) {
  return waitUntil(async () => Boolean(await evaluate(expression)), timeout);
}

async function waitUntil(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(40);
  }
  throw new Error("Tempo esgotado aguardando condição");
}

async function waitForHttp(url, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // O processo ainda está iniciando.
    }
    await delay(80);
  }
  throw new Error(`Serviço não iniciou: ${url}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
