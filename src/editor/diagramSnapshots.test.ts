import { describe, expect, it } from "vitest";
import { addDiagramSnapshot, type DiagramSnapshot } from "./diagramSnapshots";

function snapshot(id: string, diagramId = "a", createdAt = Number(id)): DiagramSnapshot {
  return { id, diagramId, createdAt, name: "A", dbml: `Table a_${id} {}`, uiLayout: id, reason: "manual" };
}

describe("diagramSnapshots", () => {
  it("deduplicates identical content and keeps newest first", () => {
    const first = snapshot("1", "a", 1);
    const duplicate = { ...snapshot("2", "a", 2), dbml: first.dbml, uiLayout: first.uiLayout };
    expect(addDiagramSnapshot([first], duplicate)).toEqual([first]);
    expect(addDiagramSnapshot([first], snapshot("3", "a", 3)).map((item) => item.id)).toEqual(["3", "1"]);
  });

  it("keeps at most twenty versions per diagram", () => {
    let versions: DiagramSnapshot[] = [];
    for (let index = 0; index < 25; index += 1) versions = addDiagramSnapshot(versions, snapshot(String(index), "a", index));
    expect(versions).toHaveLength(20);
    expect(versions[0].createdAt).toBe(24);
  });
});
