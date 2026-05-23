import { v4 as uuidv4 } from 'uuid';
import { LOGGER_DEFAULTS } from '../config';

export const generateRequestId = (): string => uuidv4();

export const extractRequestId = (headers: Record<string, unknown>): string => {
  const fromHeader =
    headers[LOGGER_DEFAULTS.REQUEST_ID_HEADER] ||
    headers[LOGGER_DEFAULTS.CORRELATION_ID_HEADER];

  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim().slice(0, 128);
  }

  return generateRequestId();
};

export const extractCorrelationId = (headers: Record<string, unknown>): string | undefined => {
  const value = headers[LOGGER_DEFAULTS.CORRELATION_ID_HEADER];
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 128);
  }
  return undefined;
};
