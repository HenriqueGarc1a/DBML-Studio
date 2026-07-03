/// <reference types="vite/client" />

declare module "elkjs/lib/elk.bundled.js" {
  export default class ELK {
    layout(graph: unknown): Promise<any>;
  }
}
