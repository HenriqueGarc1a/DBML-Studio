import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWikiDraft, readWikiDraft, writeWikiDraft } from "./wikiDraft";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("wikiDraft", () => {
  it("mantém um rascunho separado para cada projeto e permite limpá-lo", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
      },
    });

    expect(writeWikiDraft("projeto-a", "# A", "{\"version\":2}")).toBe(true);
    expect(writeWikiDraft("projeto-b", "# B")).toBe(true);
    expect(readWikiDraft("projeto-a")?.markdown).toBe("# A");
    expect(readWikiDraft("projeto-a")?.document).toBe("{\"version\":2}");
    expect(readWikiDraft("projeto-b")?.markdown).toBe("# B");

    expect(clearWikiDraft("projeto-a")).toBe(true);
    expect(readWikiDraft("projeto-a")).toBeUndefined();
    expect(readWikiDraft("projeto-b")?.markdown).toBe("# B");
  });
});
