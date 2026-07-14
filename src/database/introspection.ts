import type { DatabaseConnectionConfig, IntrospectedDatabaseSchema } from "./types";

export async function introspectDatabase(config: DatabaseConnectionConfig): Promise<IntrospectedDatabaseSchema> {
  const response = await fetch("/__dbml/introspect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const payload = await response.json().catch(() => ({})) as { schema?: IntrospectedDatabaseSchema; error?: string };
  if (!response.ok || !payload.schema) throw new Error(payload.error || "Não foi possível consultar o banco.");
  return payload.schema;
}
