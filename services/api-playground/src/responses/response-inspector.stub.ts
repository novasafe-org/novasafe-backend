/**
 * Extended response inspection (body diff, schema validation) — future.
 */
export interface ResponseInspection {
  statusCode: number;
  headers: Record<string, string>;
  bodyPreview?: string;
}
