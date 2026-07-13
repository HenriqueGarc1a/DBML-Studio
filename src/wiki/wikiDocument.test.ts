import { describe, expect, it } from "vitest";
import {
  createWikiDocument,
  getTableDocumentationProgress,
  parseWikiDocument,
  reconcileWikiDocument,
  serializeWikiDocument,
} from "./wikiDocument";
import { wikiTestDiagram as diagram } from "./wikiTestFixtures";

describe("wikiDocument", () => {
  it("cria e serializa um documento estruturado", () => {
    const document = createWikiDocument(diagram(), "Minha Loja");
    const parsed = parseWikiDocument(serializeWikiDocument(document));

    expect(parsed?.version).toBe(2);
    expect(parsed?.project.title).toBe("Minha Loja");
    expect(parsed?.tables).toHaveLength(2);
    expect(parsed?.tables[0].fields[0].description).toBe("Identificador do cliente");
  });

  it("preserva documentação em renames inequívocos e arquiva conteúdo removido", () => {
    const originalDiagram = diagram();
    const document = createWikiDocument(originalDiagram, "Loja");
    document.tables[0].description = "Cadastro principal de compradores.";
    document.tables[0].fields.find((field) => field.binding.name === "email")!.description = "Canal de contato.";
    document.tables[1].description = "Pedidos confirmados.";

    const changed = diagram();
    const customers = changed.tables[0];
    customers.id = "clients";
    customers.name = "clients";
    const email = customers.columns.find((column) => column.name === "email")!;
    email.id = "column-clients-contact-email-1";
    email.name = "contact_email";
    changed.tables = [customers];

    const result = reconcileWikiDocument(document, changed, "Loja");
    const clients = result.document.tables[0];

    expect(clients.binding.name).toBe("clients");
    expect(clients.binding.aliases).toContain("customers");
    expect(clients.description).toBe("Cadastro principal de compradores.");
    expect(clients.fields.find((field) => field.binding.name === "contact_email")?.description).toBe("Canal de contato.");
    expect(result.document.archivedTables[0].description).toBe("Pedidos confirmados.");
    expect(result.archivedTables).toBe(1);
  });

  it("mantém campos removidos no arquivo da tabela e calcula progresso", () => {
    const current = diagram();
    const document = createWikiDocument(current, "Loja");
    document.tables[0].description = "Clientes";
    document.tables[0].fields.forEach((field) => { field.description = `Descrição de ${field.binding.name}`; });
    const withoutEmail = diagram();
    withoutEmail.tables[0].columns = withoutEmail.tables[0].columns.filter((column) => column.name !== "email");

    const result = reconcileWikiDocument(document, withoutEmail, "Loja");
    expect(result.document.tables[0].archivedFields.some((field) => field.binding.name === "email")).toBe(true);
    expect(getTableDocumentationProgress(result.document.tables[0])).toBe(100);
  });
});
