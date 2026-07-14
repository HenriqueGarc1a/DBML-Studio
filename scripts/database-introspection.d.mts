export class DatabaseIntrospectionError extends Error {
  status: number;
}

export function introspectDatabase(body: Record<string, unknown>, sqliteRoot: string): Promise<unknown>;
