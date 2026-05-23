import { trustConfig, type TrustClientRegistryEntry } from '../config/trust.config';
import type { IClientRegistry, IRegisteredClient } from '../interfaces';

const toRegisteredClient = (entry: TrustClientRegistryEntry): IRegisteredClient => {
  const secret = entry.secretEnv ? process.env[entry.secretEnv] : undefined;
  return {
    clientId: entry.clientId,
    secret: secret?.trim() || undefined,
    allowedSources: entry.allowedSources,
    platform: entry.platform,
    minVersion: entry.minVersion,
  };
};

/**
 * Env-driven client registry — no hardcoded secrets in source.
 */
export class EnvClientRegistry implements IClientRegistry {
  private readonly clients: Map<string, IRegisteredClient>;

  constructor(entries = trustConfig.clientRegistry) {
    this.clients = new Map(entries.map((e) => [e.clientId, toRegisteredClient(e)]));
  }

  resolve(clientId: string): IRegisteredClient | null {
    return this.clients.get(clientId) ?? null;
  }

  list(): IRegisteredClient[] {
    return [...this.clients.values()];
  }
}

let registryInstance: EnvClientRegistry | null = null;
export const getClientRegistry = (): EnvClientRegistry => {
  if (!registryInstance) registryInstance = new EnvClientRegistry();
  return registryInstance;
};
