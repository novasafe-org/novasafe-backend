import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { playgroundConfig } from '../config/playground.config';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fs-store';
import type { TraceInspection } from '../tracing/trace-inspector';

export interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  environmentId: string;
  clientProfileId: string;
  statusCode: number;
  durationMs: number;
  trace: TraceInspection;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  createdAt: string;
  collectionId?: string;
  name?: string;
}

export interface RequestCollection {
  id: string;
  name: string;
  description?: string;
  entryIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface HistoryStoreState {
  entries: HistoryEntry[];
  collections: RequestCollection[];
}

const HISTORY_FILE = 'request-history.json';
const MAX_ENTRIES = 500;

export class HistoryStore {
  private state: HistoryStoreState = { entries: [], collections: [] };
  private loaded = false;

  private get filePath(): string {
    return path.join(playgroundConfig.dataDir, HISTORY_FILE);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await ensureDir(playgroundConfig.dataDir);
    this.state = await readJsonFile<HistoryStoreState>(this.filePath, {
      entries: [],
      collections: [],
    });
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await writeJsonFile(this.filePath, this.state);
  }

  async list(limit = 50): Promise<HistoryEntry[]> {
    await this.load();
    return [...this.state.entries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<HistoryEntry> {
    await this.load();
    const record: HistoryEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    this.state.entries.unshift(record);
    if (this.state.entries.length > MAX_ENTRIES) {
      this.state.entries = this.state.entries.slice(0, MAX_ENTRIES);
    }
    await this.persist();
    return record;
  }

  async get(id: string): Promise<HistoryEntry | undefined> {
    await this.load();
    return this.state.entries.find((e) => e.id === id);
  }

  async remove(id: string): Promise<boolean> {
    await this.load();
    const before = this.state.entries.length;
    this.state.entries = this.state.entries.filter((e) => e.id !== id);
    await this.persist();
    return this.state.entries.length < before;
  }

  async listCollections(): Promise<RequestCollection[]> {
    await this.load();
    return [...this.state.collections];
  }

  async createCollection(name: string, description?: string): Promise<RequestCollection> {
    await this.load();
    const collection: RequestCollection = {
      id: uuidv4(),
      name,
      description,
      entryIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.collections.push(collection);
    await this.persist();
    return collection;
  }

  async exportAll(): Promise<HistoryStoreState> {
    await this.load();
    return JSON.parse(JSON.stringify(this.state)) as HistoryStoreState;
  }

  async importAll(data: HistoryStoreState): Promise<void> {
    this.state = data;
    this.loaded = true;
    await this.persist();
  }
}

export const historyStore = new HistoryStore();
