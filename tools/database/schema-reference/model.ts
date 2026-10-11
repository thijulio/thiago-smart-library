export const PROJECT_SCHEMAS = [
  'auth',
  'library',
  'import_audit',
  'db_meta',
  'api_public',
] as const;
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  identity: string;
  generated: string;
  comment: string | null;
  privileges: string[];
}
export interface SchemaObject {
  id: string;
  kind: string;
  schema: string;
  name: string;
  definition: string;
  columns?: Column[];
  privileges: string[];
  details: Record<string, unknown>;
}
export interface Relationship {
  id: string;
  from: string;
  to: string;
  fromColumns: string[];
  toColumns: string[];
}
export interface SchemaReference {
  sourceCommit: string;
  postgresVersion: string;
  migrations: { name: string; checksum: string }[];
  schemas: string[];
  objects: SchemaObject[];
  relationships: Relationship[];
}
