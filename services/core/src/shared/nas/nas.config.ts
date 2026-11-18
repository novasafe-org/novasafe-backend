/**
 * NAS-Control agent connection (env-driven — never hardcode).
 */

const trim = (v: string | undefined): string => (v ?? '').trim();

export const nasConfig = {
  /** Base URL without trailing slash, e.g. https://nas-internal.pavankumartidke.dev */
  get baseUrl(): string {
    return trim(process.env.NAS_BASE_URL || process.env.NAS_URL).replace(/\/+$/, '');
  },
  get email(): string {
    return trim(process.env.NAS_EMAIL || process.env.NAS_USERNAME);
  },
  get password(): string {
    return process.env.NAS_PASSWORD ?? '';
  },
  /** Optional shared secret for X-Agent-Token on every NAS route. */
  get agentToken(): string {
    return trim(process.env.NAS_AGENT_TOKEN);
  },
  get requestTimeoutMs(): number {
    const n = Number(process.env.NAS_REQUEST_TIMEOUT_MS || 60_000);
    return Number.isFinite(n) && n > 0 ? n : 60_000;
  },
  get enabled(): boolean {
    return Boolean(this.baseUrl && this.email && this.password);
  },
} as const;

export const assertNasConfig = (): void => {
  if (!nasConfig.baseUrl) {
    throw new Error('NAS_BASE_URL (or NAS_URL) is required for document storage');
  }
  if (!nasConfig.email || !nasConfig.password) {
    throw new Error('NAS_EMAIL and NAS_PASSWORD are required for document storage');
  }
};
