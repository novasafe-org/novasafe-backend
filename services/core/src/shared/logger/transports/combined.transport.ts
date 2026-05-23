import { LOG_FILES, type LoggerConfig } from '../config';
import type { ILoggerTransport } from '../core/logger.interface';
import { FileTransport } from './file.transport';

export class CombinedTransport implements ILoggerTransport {
  readonly name = 'combined';

  constructor(private readonly config: LoggerConfig) {}

  build() {
    return new FileTransport(this.config, LOG_FILES.COMBINED).build();
  }
}
