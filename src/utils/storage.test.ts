import { afterEach, describe, expect, it, vi } from "vitest";
import { readJson, safeGetItem, safeSetItem, writeJson } from "./storage";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("storage helpers", () => {
  it("returns safe fallbacks when localStorage throws", () => {
    installLocalStorage({
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    });

    expect(safeGetItem("key")).toBeNull();
    expect(safeSetItem("key", "value")).toBe(false);
    expect(readJson("key", { fallback: true })).toEqual({ fallback: true });
  });

  it("returns fallback for invalid JSON", () => {
    installLocalStorage({
      getItem: vi.fn(() => "{nope"),
    });

    expect(readJson("settings", ["fallback"])).toEqual(["fallback"]);
  });

  it("writes and reads JSON through localStorage", () => {
    const values = new Map<string, string>();
    installLocalStorage({
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    });

    expect(writeJson("settings", { open: true })).toBe(true);
    expect(readJson("settings", { open: false })).toEqual({ open: true });
  });
});

function installLocalStorage(overrides: Partial<Storage>): void {
  const storage = {
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
    length: 0,
    ...overrides,
  } as Storage;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}
