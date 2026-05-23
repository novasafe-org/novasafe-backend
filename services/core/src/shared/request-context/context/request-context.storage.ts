import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextData } from '../types';

/**
 * Request-scoped storage (Node AsyncLocalStorage).
 * Framework-agnostic — Express/Fastify adapters populate this store.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContextData>();
