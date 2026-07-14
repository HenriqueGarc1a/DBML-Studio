import { describe, expect, it } from "vitest";
import { parseProjectBundle, serializeProjectBundle } from "./projectBundle";

describe("projectBundle", () => {
  it("roundtrips DBML, layout, preview and wiki", () => {
    const source = serializeProjectBundle({
      id: "file:shop.dbml",
      name: "Shop",
      filename: "shop.dbml",
      dbml: "Table users {\n  id int [pk]\n}",
      uiLayout: "{\"version\":1}",
      previewDataUrl: "data:image/webp;base64,abc",
      wiki: "# Shop",
      wikiDocument: "{\"version\":2}",
      updatedAt: 123,
    });
    expect(parseProjectBundle(source).project).toMatchObject({ name: "Shop", wiki: "# Shop", updatedAt: 123 });
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseProjectBundle("{}")) .toThrow(/Formato|versão/);
  });
});
