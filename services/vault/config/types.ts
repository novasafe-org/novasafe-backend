export interface BaseDBConfig {
  type: 'mongodb';
  databaseName: string;
  host: string;
  port: number | string;
  uri: string;
  collections: Record<string, string>;
}

export interface DBConfigGeneric<TCollections extends Record<string, string>> extends BaseDBConfig {
  collections: TCollections;
}
