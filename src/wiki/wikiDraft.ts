import { readJson, safeRemoveItem, writeJson } from "../utils/storage";

const WIKI_DRAFT_PREFIX = "dbml-studio-wiki-draft:";

export interface WikiDraft {
  markdown: string;
  document?: string;
  updatedAt: number;
}

export function readWikiDraft(projectId: string): WikiDraft | undefined {
  const value = readJson<unknown>(draftKey(projectId), undefined);
  if (!value || typeof value !== "object") return undefined;
  const draft = value as Partial<WikiDraft>;
  return typeof draft.markdown === "string" &&
    (draft.document === undefined || typeof draft.document === "string") &&
    typeof draft.updatedAt === "number"
    ? { markdown: draft.markdown, document: draft.document, updatedAt: draft.updatedAt }
    : undefined;
}

export function writeWikiDraft(projectId: string, markdown: string, document?: string): boolean {
  return writeJson(draftKey(projectId), { markdown, document, updatedAt: Date.now() } satisfies WikiDraft);
}

export function clearWikiDraft(projectId: string): boolean {
  return safeRemoveItem(draftKey(projectId));
}

function draftKey(projectId: string): string {
  return `${WIKI_DRAFT_PREFIX}${projectId}`;
}
