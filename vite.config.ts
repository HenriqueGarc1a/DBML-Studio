import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

export default defineConfig({
  plugins: [react(), dbmlFilesPlugin()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});

function dbmlFilesPlugin() {
  const dbmlDir = path.resolve(process.cwd(), "dbml");

  return {
    name: "dbml-files",
    configureServer(server) {
      server.middlewares.use("/__dbml/list", async (_request, response) => {
        try {
          await mkdir(dbmlDir, { recursive: true });
          const entries = await readdir(dbmlDir);
          const files = await Promise.all(
            entries
              .filter((entry) => entry.endsWith(".dbml"))
              .map(async (filename) => {
                const filePath = path.join(dbmlDir, filename);
                const [dbml, stats, uiLayout] = await Promise.all([
                  readFile(filePath, "utf8"),
                  stat(filePath),
                  readFile(`${filePath}.ui.json`, "utf8").catch(() => undefined),
                ]);

                return {
                  filename,
                  name: filename.replace(/\.dbml$/i, "").replace(/-/g, " "),
                  dbml,
                  uiLayout,
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

          if (!filename || !contents.trim()) {
            sendJson(response, 400, { error: "Invalid DBML payload" });
            return;
          }

          await mkdir(dbmlDir, { recursive: true });
          await writeFile(path.join(dbmlDir, filename), contents, "utf8");
          if (uiLayout?.trim()) {
            await writeFile(path.join(dbmlDir, `${filename}.ui.json`), uiLayout, "utf8");
          }
          sendJson(response, 200, { filename });
        } catch (error) {
          sendJson(response, 500, { error: formatError(error) });
        }
      });
    },
  };
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
