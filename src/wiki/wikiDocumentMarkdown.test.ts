import { describe, expect, it } from "vitest";
import { createWikiBusinessRule, createWikiCustomSection, createWikiDocument } from "./wikiDocument";
import { generateWikiMarkdown } from "./wikiGenerator";
import {
  generateWikiMarkdownFromDocument,
  getWikiColumnRestrictions,
  migrateWikiMarkdown,
} from "./wikiDocumentMarkdown";
import { wikiTestDiagram as diagram } from "./wikiTestFixtures";

describe("wikiDocumentMarkdown", () => {
  it("gera Markdown determinístico a partir do documento e do esquema", () => {
    const model = diagram();
    const document = createWikiDocument(model, "Loja");
    document.project.introduction = "Contexto da plataforma.";
    document.tables[0].description = "Pessoas que compram na loja.";
    document.tables[0].fields[1].description = "E-mail usado para autenticação.";
    document.tables[0].businessRules.push({ ...createWikiBusinessRule(), text: "O e-mail deve ser único." });
    document.customSections.push({ ...createWikiCustomSection("Operação"), body: "Rotinas de manutenção." });

    const markdown = generateWikiMarkdownFromDocument(model, document);

    expect(markdown).toContain("# Loja");
    expect(markdown).toContain("Contexto da plataforma.");
    expect(markdown).toContain("> Pessoas que compram na loja.");
    expect(markdown).toContain("E-mail usado para autenticação.");
    expect(markdown).toContain("PK<br>NOT NULL");
    expect(markdown).toContain("FK → `customers.id`<br>NOT NULL");
    expect(markdown).toContain("- O e-mail deve ser único.");
    expect(markdown).toContain("# Operação");
  });

  it("migra a Wiki Markdown conhecida preservando descrições e regras", () => {
    const model = diagram();
    const legacy = generateWikiMarkdown(model, { projectName: "Loja antiga" })
      .replace("_A documentar._", "Descrição manual do e-mail.")
      .replace(
        "- [ ] Documentar as regras de negócio relacionadas à tabela `customers`.",
        "- Cliente bloqueado não pode comprar.",
      );

    const migrated = migrateWikiMarkdown(legacy, model, "Loja");
    const customers = migrated.tables.find((table) => table.binding.name === "customers")!;

    expect(migrated.project.title).toBe("Loja antiga");
    expect(customers.fields.some((field) => field.description === "Descrição manual do e-mail.")).toBe(true);
    expect(customers.businessRules[0].text).toBe("Cliente bloqueado não pode comprar.");
  });

  it("guarda Markdown não reconhecido em uma seção legada", () => {
    const migrated = migrateWikiMarkdown("Texto livre sem estrutura\n\n- importante", diagram(), "Loja");
    expect(migrated.customSections[0].title).toMatch(/legado/i);
    expect(migrated.customSections[0].body).toContain("Texto livre sem estrutura");
  });

  it("expõe restrições derivadas sem permitir edição estrutural", () => {
    const model = diagram();
    expect(getWikiColumnRestrictions(model, model.tables[0], model.tables[0].columns[0])).toEqual(["PK", "NOT NULL"]);
    expect(getWikiColumnRestrictions(model, model.tables[1], model.tables[1].columns[1])).toEqual(["FK → customers.id", "NOT NULL"]);
  });
});
