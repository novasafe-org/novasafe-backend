import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { playgroundConfig } from '../config/playground.config';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fs-store';

export type AuthTokenType = 'access' | 'refresh' | 'oauth' | 'session' | 'custom';

export interface StoredToken {
  id: string;
  type: AuthTokenType;
  label: string;
  value: string;
  provider?: 'jwt' | 'google' | 'apple' | 'oauth' | 'session';
  createdAt: string;
  expiresAt?: string;
}

export interface TokenVaultState {
  activeTokenId: string | null;
  tokens: StoredToken[];
}

const VAULT_FILE = 'auth-vault.json';

export class TokenVaultService {
  private state: TokenVaultState = { activeTokenId: null, tokens: [] };
  private loaded = false;

  private get filePath(): string {
    return path.join(playgroundConfig.dataDir, VAULT_FILE);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await ensureDir(playgroundConfig.dataDir);
    this.state = await readJsonFile<TokenVaultState>(this.filePath, {
      activeTokenId: null,
      tokens: [],
    });
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await writeJsonFile(this.filePath, this.state);
  }

  async list(): Promise<TokenVaultState> {
    await this.load();
    return {
      activeTokenId: this.state.activeTokenId,
      tokens: this.state.tokens.map((t) => ({ ...t, value: maskToken(t.value) })),
    };
  }

  async listRaw(): Promise<TokenVaultState> {
    await this.load();
    return { ...this.state, tokens: [...this.state.tokens] };
  }

  async upsert(input: Omit<StoredToken, 'id' | 'createdAt'> & { id?: string }): Promise<StoredToken> {
    await this.load();
    const existing = input.id ? this.state.tokens.find((t) => t.id === input.id) : undefined;
    const token: StoredToken = {
      id: existing?.id ?? uuidv4(),
      type: input.type,
      label: input.label,
      value: input.value,
      provider: input.provider,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresAt: input.expiresAt,
    };
    if (existing) {
      this.state.tokens = this.state.tokens.map((t) => (t.id === token.id ? token : t));
    } else {
      this.state.tokens.push(token);
    }
    await this.persist();
    return token;
  }

  async setActive(tokenId: string | null): Promise<void> {
    await this.load();
    this.state.activeTokenId = tokenId;
    await this.persist();
  }

  async remove(tokenId: string): Promise<boolean> {
    await this.load();
    const before = this.state.tokens.length;
    this.state.tokens = this.state.tokens.filter((t) => t.id !== tokenId);
    if (this.state.activeTokenId === tokenId) this.state.activeTokenId = null;
    await this.persist();
    return this.state.tokens.length < before;
  }

  async getActiveBearer(): Promise<string | null> {
    await this.load();
    if (!this.state.activeTokenId) return null;
    const token = this.state.tokens.find((t) => t.id === this.state.activeTokenId);
    if (!token?.value) return null;
    return token.value.startsWith('Bearer ') ? token.value : `Bearer ${token.value}`;
  }

  async clear(): Promise<void> {
    this.state = { activeTokenId: null, tokens: [] };
    await this.persist();
  }
}

const maskToken = (value: string): string => {
  if (value.length <= 12) return '***';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

export const tokenVaultService = new TokenVaultService();
