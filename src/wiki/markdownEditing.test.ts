import { describe, expect, it } from "vitest";
import { applyMarkdownEdit } from "./markdownEditing";

describe("applyMarkdownEdit", () => {
  it("envolve a seleção e preserva o foco no conteúdo", () => {
    const result = applyMarkdownEdit("um texto aqui", 3, 8, "bold");
    expect(result.value).toBe("um **texto** aqui");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("texto");
  });

  it("transforma todas as linhas selecionadas em lista", () => {
    const result = applyMarkdownEdit("antes\nprimeiro\nsegundo\ndepois", 6, 22, "bullet-list");
    expect(result.value).toContain("- primeiro\n- segundo");
  });

  it("insere uma tabela em um bloco separado", () => {
    const result = applyMarkdownEdit("Introdução", 10, 10, "table");
    expect(result.value).toContain("\n\n| Coluna 1 | Coluna 2 |");
  });
});
