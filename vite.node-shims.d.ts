declare const process: {
  cwd: () => string;
};

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readdir(path: string): Promise<string[]>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function stat(path: string): Promise<{ mtimeMs: number }>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

declare module "node:http" {
  export interface IncomingMessage {
    method?: string;
    on(event: "data", callback: (chunk: unknown) => void): this;
    on(event: "end", callback: () => void): this;
    on(event: "error", callback: (error: Error) => void): this;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body: string): void;
  }
}

declare module "node:path" {
  const path: {
    resolve: (...parts: string[]) => string;
    join: (...parts: string[]) => string;
  };

  export default path;
}
