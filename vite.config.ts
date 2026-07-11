import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), dbmlFilesPlugin(env.DBML_SAVES_DIR, env.DBML_LEGACY_DIR)],
    build: {
      chunkSizeWarningLimit: 1500,
    },
  };
});

function dbmlFilesPlugin(configuredSavesDir?: string, configuredLegacyDir?: string) {
  const savesDir = path.resolve(configuredSavesDir ?? path.join(process.cwd(), "saves"));
  const legacyDir = path.resolve(configuredLegacyDir ?? path.join(process.cwd(), "dbml"));

  return {
    name: "dbml-files",
    configureServer(server) {
      server.middlewares.use("/__dbml/list", async (_request, response) => {
        try {
          await migrateLegacySaves(legacyDir, savesDir);
          await mkdir(savesDir, { recursive: true });
          const entries = await readdir(savesDir);
          const files = await Promise.all(
            entries
              .map(async (folder) => {
                const saveDir = path.join(savesDir, folder);
                const filePath = path.join(saveDir, "diagram.dbml");
                const [dbml, stats, uiLayout, preview, wiki] = await Promise.all([
                  readFile(filePath, "utf8"),
                  stat(filePath),
                  readFile(path.join(saveDir, "ui.json"), "utf8").catch(() => undefined),
                  readFile(path.join(saveDir, "preview.webp")).catch(() => undefined),
                  readFile(path.join(saveDir, "wiki.md"), "utf8").catch(() => undefined),
                ]);

                return {
                  filename: `${folder}.dbml`,
                  name: folder.replace(/-/g, " "),
                  dbml,
                  wiki,
                  uiLayout,
                  previewDataUrl: preview ? `data:image/webp;base64,${preview.toString("base64")}` : undefined,
                  updatedAt: stats.mtimeMs,
                };
              }),
          );

          sendJson(response, 200, { files });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });

      server.middlewares.use("/__dbml/save", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const filename = safeDbmlFilename(String(body.filename ?? ""));
          const contents = String(body.contents ?? "");
          const uiLayout = typeof body.uiLayout === "string" ? body.uiLayout : undefined;
          const previewDataUrl = typeof body.previewDataUrl === "string" ? body.previewDataUrl : undefined;

          if (!filename || !contents.trim()) {
            sendJson(response, 400, { error: "Invalid DBML payload" });
            return;
          }

          const saveDir = saveDirectory(savesDir, filename);
          await mkdir(saveDir, { recursive: true });
          await writeFile(path.join(saveDir, "diagram.dbml"), contents, "utf8");
          if (uiLayout?.trim()) {
            await writeFile(path.join(saveDir, "ui.json"), uiLayout, "utf8");
          }
          const preview = previewDataUrl?.match(/^data:image\/webp;base64,(.+)$/)?.[1];
          if (preview) await writeFile(path.join(saveDir, "preview.webp"), Buffer.from(preview, "base64"));
          sendJson(response, 200, { filename });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });

      server.middlewares.use("/__dbml/wiki", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const filename = safeDbmlFilename(String(body.filename ?? ""));
          const contents = typeof body.contents === "string" ? body.contents : "";
          if (!filename) {
            sendJson(response, 400, { error: "Invalid wiki payload" });
            return;
          }

          const saveDir = saveDirectory(savesDir, filename);
          await mkdir(saveDir, { recursive: true });
          await writeFile(path.join(saveDir, "wiki.md"), contents, "utf8");
          sendJson(response, 200, { filename });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });

      server.middlewares.use("/__dbml/rename", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }
        try {
          const body = await readJsonBody(request);
          const from = safeDbmlFilename(String(body.from ?? ""));
          const to = safeDbmlFilename(String(body.to ?? ""));
          if (from !== to) {
            await rename(saveDirectory(savesDir, from), saveDirectory(savesDir, to));
          }
          sendJson(response, 200, { filename: to });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });

      server.middlewares.use("/__dbml/delete", async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }
        try {
          const body = await readJsonBody(request);
          const filename = safeDbmlFilename(String(body.filename ?? ""));
          await rm(saveDirectory(savesDir, filename), { recursive: true, force: true });
          sendJson(response, 200, { filename });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });
    },
  };
}

function saveDirectory(root: string, filename: string): string {
  return path.join(root, filename.replace(/\.dbml$/i, ""));
}

async function migrateLegacySaves(legacyDir: string, savesDir: string): Promise<void> {
  const entries = await readdir(legacyDir).catch(() => [] as string[]);
  const filenames = entries.filter((entry) => entry.endsWith(".dbml"));
  if (!filenames.length) return;
  await mkdir(savesDir, { recursive: true });
  await Promise.all(filenames.map(async (filename) => {
    const target = saveDirectory(savesDir, filename);
    await mkdir(target, { recursive: true });
    await rename(path.join(legacyDir, filename), path.join(target, "diagram.dbml")).catch(() => undefined);
    await rename(path.join(legacyDir, `${filename}.ui.json`), path.join(target, "ui.json")).catch(() => undefined);
    await rename(path.join(legacyDir, `${filename}.preview.webp`), path.join(target, "preview.webp")).catch(() => undefined);
  }));
}

function safeDbmlFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filename = cleaned || "diagram.dbml";
  return filename.endsWith(".dbml") ? filename : `${filename}.dbml`;
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
