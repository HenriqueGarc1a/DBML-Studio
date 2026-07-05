import { describe, expect, it } from "vitest";
import { getExportFlowArrowCount } from "./pdfExport";

describe("pdf export helpers", () => {
  it("keeps all-flow arrow density readable across relation lengths", () => {
    expect(getExportFlowArrowCount(12)).toBe(0);
    expect(getExportFlowArrowCount(80)).toBe(2);
    expect(getExportFlowArrowCount(180)).toBe(3);
    expect(getExportFlowArrowCount(360)).toBe(4);
    expect(getExportFlowArrowCount(520)).toBe(5);
    expect(getExportFlowArrowCount(720)).toBe(6);
  });
});
