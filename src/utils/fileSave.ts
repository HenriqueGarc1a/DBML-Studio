import { downloadText } from "./download";

export interface TextFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

export interface WorkspaceDbmlFile {
  filename: string;
  name: string;
  dbml: string;
  uiLayout?: string;
  previewDataUrl?: string;
  updatedAt: number;
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<TextFileHandle>;
}

export async function saveTextFile(
  filename: string,
  contents: string,
  handle?: TextFileHandle,
): Promise<{ saved: boolean; handle?: TextFileHandle }> {
  if (!contents.trim()) return { saved: false, handle };

  if (await saveWorkspaceDbml(filename, contents, { keepalive: true })) {
    return { saved: true, handle };
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker && !handle) {
    return { saved: downloadText(filename, contents) };
  }

  try {
    const nextHandle = handle ?? await picker?.({
      suggestedName: filename,
      types: [
        {
          description: "DBML",
          accept: { "text/plain": [".dbml"] },
        },
      ],
    });

    if (!nextHandle) return { saved: false, handle };

    const writable = await nextHandle.createWritable();
    await writable.write(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    await writable.close();
    return { saved: true, handle: nextHandle };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { saved: false, handle };
    }

    throw error;
  }
}

export async function saveWorkspaceDbml(
  filename: string,
  contents: string,
  options: { keepalive?: boolean; uiLayout?: string; previewDataUrl?: string } = {},
): Promise<boolean> {
  if (!contents.trim()) return false;

  try {
    const response = await fetch("/__dbml/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contents, uiLayout: options.uiLayout, previewDataUrl: options.previewDataUrl }),
      keepalive: options.keepalive,
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function renameWorkspaceDbml(from: string, to: string): Promise<boolean> {
  if (!from || !to || from === to) return true;
  try {
    const response = await fetch("/__dbml/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sendWorkspaceDbmlBeacon(filename: string, contents: string, uiLayout?: string): boolean {
  if (!contents.trim() || !navigator.sendBeacon) return false;

  try {
    return navigator.sendBeacon(
      "/__dbml/save",
      new Blob([JSON.stringify({ filename, contents, uiLayout })], { type: "application/json" }),
    );
  } catch {
    return false;
  }
}

export async function listWorkspaceDbml(): Promise<WorkspaceDbmlFile[] | undefined> {
  try {
    const response = await fetch("/__dbml/list");
    if (!response.ok) return undefined;
    const payload = await response.json();
    return Array.isArray(payload.files) ? payload.files.filter(isWorkspaceDbmlFile) : undefined;
  } catch {
    return undefined;
  }
}

function isWorkspaceDbmlFile(value: unknown): value is WorkspaceDbmlFile {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceDbmlFile>;
  return (
    typeof item.filename === "string" &&
    typeof item.name === "string" &&
    typeof item.dbml === "string" &&
    (item.uiLayout === undefined || typeof item.uiLayout === "string") &&
    (item.previewDataUrl === undefined || typeof item.previewDataUrl === "string") &&
    typeof item.updatedAt === "number"
  );
}
