import { ERROR_CODES, HTTP } from "./constants";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? HTTP.INTERNAL;
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.details = options.details;
  }
}

export class NotImplementedError extends AppError {
  constructor(feature: string) {
    super(`${feature} is not implemented yet`, {
      status: HTTP.INTERNAL,
      code: ERROR_CODES.NOT_IMPLEMENTED,
    });
    this.name = "NotImplementedError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, {
      status: HTTP.UNPROCESSABLE,
      code: ERROR_CODES.VALIDATION_ERROR,
      details,
    });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, { status: HTTP.UNAUTHORIZED, code: ERROR_CODES.UNAUTHORIZED });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, { status: HTTP.FORBIDDEN, code: ERROR_CODES.FORBIDDEN });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, { status: HTTP.NOT_FOUND, code: ERROR_CODES.NOT_FOUND });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { status: HTTP.CONFLICT, code: ERROR_CODES.CONFLICT, details });
    this.name = "ConflictError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
