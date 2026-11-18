/**
 * Application error types — safe for API responses (no upstream leakage).
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      success: false as const,
      code: this.code,
      message: this.message,
    };
  }
}
