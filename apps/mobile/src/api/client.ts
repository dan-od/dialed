import type { ErrorCode } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import { ApiError, COPY } from './errors';

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface TokenSource {
  current(): Tokens | null;
  /** Persist a rotated pair. */
  save(tokens: Tokens): Promise<void>;
  /** Called once when refresh fails: the global sessionEnded(). */
  ended(reason: 'revoked'): Promise<void>;
}

type Fetch = typeof fetch;

/**
 * The one api client (identity-session contract): x-request-id per request, bearer token,
 * one refresh on 401 token_expired, then sessionEnded on failure. Network failure → `offline`.
 */
export class ApiClient {
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenSource,
    private readonly fetchImpl: Fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 15_000,
  ) {}

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean } = {},
  ): Promise<T> {
    const auth = opts.auth ?? true;
    const first = await this.send(method, path, body, auth);
    if (auth && first.status === 401 && first.code === 'token_expired') {
      if (await this.refresh()) return this.unwrap<T>(await this.send(method, path, body, auth));
      throw new ApiError('unauthorized', COPY.unauthorized!, 401);
    }
    if (auth && first.status === 401) {
      await this.tokens.ended('revoked');
      throw new ApiError('unauthorized', COPY.unauthorized!, 401);
    }
    return this.unwrap<T>(first);
  }

  private unwrap<T>(r: {
    status: number;
    json: unknown;
    code?: ErrorCode;
    message?: string;
    details?: Record<string, unknown>;
  }): T {
    if (r.status >= 200 && r.status < 300) return r.json as T;
    throw new ApiError(
      r.code ?? 'server_error',
      r.message ?? COPY.server_error!,
      r.status,
      r.details,
    );
  }

  private async send(method: string, path: string, body: unknown, auth: boolean) {
    const headers: Record<string, string> = {
      'x-request-id': randomUUID(),
      accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const t = this.tokens.current();
    if (auth && t) headers.authorization = `Bearer ${t.access_token}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch {
      throw new ApiError('offline', COPY.offline!, 0);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const err = (
      json as {
        error?: { code?: ErrorCode; message?: string; details?: Record<string, unknown> };
      } | null
    )?.error;
    return {
      status: res.status,
      json,
      code: err?.code,
      message: err?.message,
      details: err?.details,
    };
  }

  /** Single-flight refresh; rotating refresh tokens must never be used twice. */
  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const t = this.tokens.current();
      if (!t) return false;
      const r = await this.send(
        'POST',
        '/v1/auth/refresh',
        { refresh_token: t.refresh_token },
        false,
      );
      if (r.status === 200) {
        await this.tokens.save(r.json as Tokens);
        return true;
      }
      if (r.status === 401) await this.tokens.ended('revoked');
      return false;
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
}
