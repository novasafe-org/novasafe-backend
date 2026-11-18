import { decodeJwt } from 'jose';
import { StorageError, StorageErrorCodes } from '../storage/storage.errors';
import { assertNasConfig, nasConfig } from './nas.config';
import {
  isNasAuthRetryable,
  mapNasHttpError,
  type NasEnvelope,
} from './nas.errors';
import { readNasTokens, writeNasTokens } from './nas.token-store';

export type NasRequestInit = {
  method?: string;
  path: string;
  /** JSON body (mutually exclusive with formData / body). */
  json?: unknown;
  formData?: FormData;
  body?: string | Blob | ArrayBuffer | FormData | null;
  headers?: Record<string, string>;
  /** Skip Authorization bearer (login/refresh). */
  skipAuth?: boolean;
  /** Do not retry login on 401 (internal). */
  skipAuthRetry?: boolean;
  /** Return raw Response (for streams). */
  raw?: boolean;
};

export type NasFileMeta = {
  id: string;
  original_filename?: string;
  filename?: string;
  filepath?: string;
  mime_type?: string;
  size?: number;
  type?: string;
};

let loginInFlight: Promise<string> | null = null;

const buildUrl = (path: string): string => {
  const base = nasConfig.baseUrl;
  if (!base) {
    throw new StorageError(
      'Document storage is not configured.',
      503,
      StorageErrorCodes.STORAGE_MISCONFIGURED,
    );
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};

const agentHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (nasConfig.agentToken) {
    h['X-Agent-Token'] = nasConfig.agentToken;
  }
  return h;
};

const expiryFromAccessToken = (accessToken: string): Date | null => {
  try {
    const claims = decodeJwt(accessToken);
    if (typeof claims.exp === 'number') {
      return new Date(claims.exp * 1000);
    }
  } catch {
    /* ignore */
  }
  return null;
};

const parseEnvelope = async (res: Response): Promise<NasEnvelope | null> => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as NasEnvelope;
  } catch {
    return { success: false, message: text.slice(0, 200), data: null };
  }
};

/**
 * Login to NAS-Control with env credentials; encrypt+persist tokens.
 */
export const nasLogin = async (): Promise<string> => {
  assertNasConfig();
  if (loginInFlight) return loginInFlight;

  loginInFlight = (async () => {
    const res = await fetch(buildUrl('/auth/login'), {
      method: 'POST',
      headers: {
        ...agentHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: nasConfig.email,
        password: nasConfig.password,
      }),
      signal: AbortSignal.timeout(nasConfig.requestTimeoutMs),
    }).catch((err: Error) => {
      throw mapNasHttpError(0, null, err.message);
    });

    const envelope = await parseEnvelope(res);
    if (!res.ok || envelope?.success === false) {
      throw mapNasHttpError(res.status, envelope);
    }

    const data = (envelope?.data || {}) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token) {
      throw new StorageError(
        'Document storage authentication failed. Please try again later.',
        503,
        StorageErrorCodes.STORAGE_AUTH_FAILED,
      );
    }

    await writeNasTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiryFromAccessToken(data.access_token),
    });
    return data.access_token;
  })();

  try {
    return await loginInFlight;
  } finally {
    loginInFlight = null;
  }
};

const ensureAccessToken = async (): Promise<string> => {
  const stored = await readNasTokens();
  if (stored?.accessToken) {
    const exp = stored.tokenExpiresAt;
    if (!exp || exp.getTime() > Date.now() + 30_000) {
      return stored.accessToken;
    }
  }
  return nasLogin();
};

/**
 * Authenticated request wrapper: injects bearer + agent token, maps errors,
 * re-logins once on retryable 401.
 */
export async function nasRequest<T = unknown>(
  init: NasRequestInit & { raw?: false },
): Promise<{ status: number; data: T; message?: string }>;
export async function nasRequest(init: NasRequestInit & { raw: true }): Promise<Response>;
export async function nasRequest<T = unknown>(
  init: NasRequestInit,
): Promise<{ status: number; data: T; message?: string } | Response> {
  if (!nasConfig.enabled && !init.skipAuth) {
    throw new StorageError(
      'Document storage is not configured.',
      503,
      StorageErrorCodes.STORAGE_MISCONFIGURED,
    );
  }

  const run = async (accessToken: string | null, allowRetry: boolean): Promise<Response> => {
    const headers: Record<string, string> = {
      ...agentHeaders(),
      ...init.headers,
    };
    if (!init.skipAuth && accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let body: string | Blob | ArrayBuffer | FormData | undefined | null;
    if (init.formData) body = init.formData;
    else if (init.json !== undefined) body = JSON.stringify(init.json);
    else if (init.body !== undefined) body = init.body;

    try {
      return await fetch(buildUrl(init.path), {
        method: init.method || (init.json || init.formData || init.body ? 'POST' : 'GET'),
        headers,
        body: body ?? undefined,
        signal: AbortSignal.timeout(nasConfig.requestTimeoutMs),
      });
    } catch (err) {
      throw mapNasHttpError(0, null, err instanceof Error ? err.message : 'network error');
    }
  };

  let token = init.skipAuth ? null : await ensureAccessToken();
  let res = await run(token, true);

  if (
    res.status === 401 &&
    !init.skipAuth &&
    !init.skipAuthRetry
  ) {
    const peek = res.clone();
    const envelope = await parseEnvelope(peek);
    const msg = String(envelope?.message || '');
    if (isNasAuthRetryable(res.status, msg)) {
      token = await nasLogin();
      res = await run(token, false);
    } else {
      throw mapNasHttpError(res.status, envelope);
    }
  }

  if (init.raw) {
    if (!res.ok) {
      const envelope = await parseEnvelope(res);
      throw mapNasHttpError(res.status, envelope);
    }
    return res;
  }

  const envelope = await parseEnvelope(res);
  if (!res.ok || envelope?.success === false) {
    throw mapNasHttpError(res.status, envelope);
  }

  return {
    status: res.status,
    data: (envelope?.data as T) ?? (null as T),
    message: envelope?.message,
  };
}

/** Upload a file buffer to NAS-Control `POST /files/upload`. */
export const nasUploadFile = async (input: {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  relativePath?: string;
}): Promise<NasFileMeta> => {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.buffer)], {
    type: input.mimeType || 'application/octet-stream',
  });
  form.append('file', blob, input.filename);
  if (input.relativePath) {
    form.append('path', input.relativePath);
  }

  const { data } = await nasRequest<NasFileMeta>({
    method: 'POST',
    path: '/files/upload',
    formData: form,
  });

  if (!data?.id) {
    throw new StorageError(
      'Document storage error. Please try again.',
      502,
      StorageErrorCodes.STORAGE_UPSTREAM_ERROR,
    );
  }
  return data;
};

/** Download / stream a NAS file by id. */
export const nasDownloadFile = async (fileId: string): Promise<Response> => {
  const id = encodeURIComponent(fileId);
  return nasRequest({
    method: 'GET',
    path: `/files/download/${id}`,
    raw: true,
  });
};

/** Delete a NAS file by id. */
export const nasDeleteFile = async (fileId: string): Promise<void> => {
  const id = encodeURIComponent(fileId);
  await nasRequest({
    method: 'DELETE',
    path: `/files/${id}`,
  });
};
