import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LOG_FILES, type LoggerConfig } from '../config';
import type { ILoggerTransport } from '../core/logger.interface';
import { createStructuredJsonFormat } from '../formatters';

const ensureLogDir = (logDir: string): string => {
  const resolved = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
};

export class FileTransport implements ILoggerTransport {
  readonly name = 'file';

  constructor(
    private readonly config: LoggerConfig,
    private readonly filename: string = LOG_FILES.COMBINED,
    private readonly level?: string,
  ) {}

  build(): winston.transport {
    const logDir = ensureLogDir(this.config.logDir);
    return new DailyRotateFile({
      dirname: logDir,
      filename: this.filename,
      datePattern: this.config.datePattern,
      maxSize: this.config.maxSize,
      maxFiles: this.config.maxFiles,
      level: this.level || this.config.level,
      format: createStructuredJsonFormat(this.config),
      zippedArchive: true,
    });
  }
}
