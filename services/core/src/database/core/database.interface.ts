import type { Connection } from 'mongoose';
import type { ConnectionEventName, ConnectionState } from './database.types';

export type { ConnectionEventName, ConnectionState };

export interface IDatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  getConnection(): Connection;
  getState(): ConnectionState;
  isReady(): boolean;
  on(event: ConnectionEventName, listener: (...args: unknown[]) => void): void;
  off(event: ConnectionEventName, listener: (...args: unknown[]) => void): void;
}

export interface IConnectionManager {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getStatus(): ConnectionManagerStatus;
  getDatabaseConnection(): IDatabaseConnection;
}

export interface ConnectionManagerStatus {
  state: ConnectionState;
  ready: boolean;
  dbName: string;
  host?: string;
}
