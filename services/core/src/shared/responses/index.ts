/**
 * Standard API response helpers — placeholder.
 */

export const successResponse = <T>(data: T) => ({
  success: true as const,
  data,
});

export const errorResponse = (message: string, code = 'ERROR') => ({
  success: false as const,
  error: message,
  code,
});
