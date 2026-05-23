import type { LogMeta } from '../core/logger.types';
import type { LoggerService } from './logger.service';

export class AuditLoggerService {
  constructor(private readonly logger: LoggerService) {}

  log(action: string, meta: LogMeta = {}): void {
    this.logger.audit(`Audit: ${action}`, {
      audit: true,
      action,
      ...meta,
    });
  }
}
