import type { HttpIncomingMessage } from '../types';
import { resolveTraceIds } from '../utils';

export type TraceResolution = ReturnType<typeof resolveTraceIds>;

/**
 * Resolves distributed trace identifiers from an incoming message.
 */
export const resolveRequestTrace = (message: HttpIncomingMessage): TraceResolution =>
  resolveTraceIds(message.headers);
