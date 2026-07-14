export type DatabaseDialect = "postgres" | "mysql" | "sqlite";

export interface DatabaseConnectionConfig {
  dialect: DatabaseDialect;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  path?: string;
}

export interface IntrospectedColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  primaryKey: boolean;
  autoIncrement: boolean;
}

export interface IntrospectedIndex {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  type: string;
}

export interface IntrospectedForeignKey {
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface IntrospectedTable {
  schema: string;
  name: string;
  columns: IntrospectedColumn[];
  indexes: IntrospectedIndex[];
  foreignKeys: IntrospectedForeignKey[];
}

export interface IntrospectedDatabaseSchema {
  dialect: DatabaseDialect;
  database: string;
  tables: IntrospectedTable[];
}
