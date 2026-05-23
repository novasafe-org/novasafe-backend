import type { ClientSession, Document, FilterQuery, Model, SortOrder, UpdateQuery } from 'mongoose';

export type EntityId = string;

export interface EntityMetadata {
  [key: string]: unknown;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: Record<string, SortOrder>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface RepositoryOptions {
  session?: ClientSession;
}

export type MongooseDocument = Document;
export type MongooseModel<T extends Document> = Model<T>;
export type MongooseFilter<T> = FilterQuery<T>;
export type MongooseUpdate<T> = UpdateQuery<T>;

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  ERROR = 'error',
}

export type ConnectionEventName = 'connected' | 'disconnected' | 'reconnecting' | 'error';
