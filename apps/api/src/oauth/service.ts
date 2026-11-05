import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { pepperedHash, randomToken } from '../lib/crypto';
import { appError } from '../lib/errors';
import type { Db } from '../db/pool';
import type { Config } from '../config';

type Row = Record<string, unknown>;

const ACCESS_TTL_S = 3600;
const REFRESH_TTL_DAYS = 30;
const CODE_TTL_S = 60;
const MAX_REGISTRATIONS_PER_HOUR = 10;

export interface OAuthClient {
  id: string;
  name: string;
  redirect_uris: string[];
  scope: string;
}

export class OAuthService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
  ) {}

  private hash(v: string) {
    return pepperedHash(this.config.CODE_PEPPER, v);
  }

  // ---------- Dynamic Client Registration (RFC 7591) ----------

  async register(
    name: string,
    redirectUris: string[],
    clientIp: string,
  ): Promise<{ client_id: string; client_name: string; redirect_uris: string[] }> {
    if (name.length > 80)
      throw appError('bad_request', 'Client name must be 80 characters or fewer.');
    if (redirectUris.length === 0)
      throw appError('bad_request', 'At least one redirect URI is required.');

    for (const uri of redirectUris) {
      if (!isValidRedirectUri(uri)) {
        throw appError('bad_request', 'Redirect URIs must use https or be a loopback address.');
      }
    }

    const { rows } = await this.db.execute<{ cnt: number }>(sql`
      select count(*)::int as cnt from oauth_clients
      where registration_ip = ${clientIp}::inet
        and created_at > now() - interval '1 hour'`);
    if ((rows[0]?.cnt ?? 0) >= MAX_REGISTRATIONS_PER_HOUR) {
      throw appError('rate_limited', 'Too many client registrations. Try again later.');
    }

    const clientId = `dialed_${randomBytes(16).toString('hex')}`;
    await this.db.execute(sql`
      insert into oauth_clients (id, name, redirect_uris, scope, registration_ip)
      values (${clientId}, ${name}, ${redirectUris}, 'schedule:read plans:draft', ${clientIp}::inet)`);

    return { client_id: clientId, client_name: name, redirect_uris: redirectUris };
  }

  // ---------- Authorization ----------

  async createCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    codeChallenge: string,
    scope: string,
  ): Promise<string> {
    const client = await this.getClient(clientId);
    if (!client) throw appError('bad_request', 'Unknown client.');
    if (!client.redirect_uris.includes(redirectUri)) {
      throw appError('bad_request', 'Redirect URI does not match.');
    }

    const code = randomToken(32);
    const codeHash = this.hash(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_S * 1000);

    await this.db.execute(sql`
      insert into oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
      values (${codeHash}, ${clientId}, ${userId}, ${redirectUri}, ${codeChallenge}, ${scope}, ${expiresAt.toISOString()}::timestamptz)`);

    return code;
  }

  // ---------- Token Exchange ----------

  async exchangeCode(
    clientId: string,
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  }> {
    const codeHash = this.hash(code);

    const { rows } = await this.db.execute<Row>(sql`
      select * from oauth_codes
      where code_hash = ${codeHash}
        and client_id = ${clientId}
        and redirect_uri = ${redirectUri}
        and consumed_at is null
        and expires_at > now()`);

    const row = rows[0];
    if (!row) throw appError('bad_request', 'Invalid or expired authorization code.');

    // PKCE S256 verification
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update(codeVerifier).digest('base64url');
    if (expected !== String(row.code_challenge)) {
      throw appError('bad_request', 'PKCE verification failed.');
    }

    // Consume the code
    await this.db.execute(sql`
      update oauth_codes set consumed_at = now() where code_hash = ${codeHash}`);

    return this.issueTokenPair(clientId, String(row.user_id), String(row.scope));
  }

  async refreshToken(
    clientId: string,
    refreshTokenValue: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  }> {
    const h = this.hash(refreshTokenValue);

    const { rows } = await this.db.execute<Row>(sql`
      select * from oauth_tokens
      where refresh_token_hash = ${h}
        and client_id = ${clientId}
        and revoked_at is null`);

    const row = rows[0];
    if (!row) {
      // Possible reuse: revoke the family
      const { rows: reused } = await this.db.execute<Row>(sql`
        select family_id from oauth_tokens where refresh_token_hash = ${h} and client_id = ${clientId}`);
      if (reused[0]?.family_id) {
        await this.db.execute(sql`
          update oauth_tokens set revoked_at = now()
          where family_id = ${String(reused[0].family_id)} and revoked_at is null`);
      }
      throw appError('unauthorized', 'Refresh token invalid or reused.');
    }

    if (row.refresh_expires_at && new Date(String(row.refresh_expires_at)) <= new Date()) {
      throw appError('unauthorized', 'Refresh token expired.');
    }

    // Revoke the old token
    await this.db.execute(sql`
      update oauth_tokens set revoked_at = now() where id = ${String(row.id)}`);

    return this.issueTokenPair(
      clientId,
      String(row.user_id),
      String(row.scope),
      String(row.family_id),
    );
  }

  // ---------- Token Verification (for MCP) ----------

  async verifyAccessToken(
    token: string,
  ): Promise<{ userId: string; clientId: string; scope: string; clientName: string }> {
    const h = this.hash(token);
    const { rows } = await this.db.execute<Row>(sql`
      select t.user_id, t.client_id, t.scope, c.name as client_name
      from oauth_tokens t
      join oauth_clients c on c.id = t.client_id
      where t.access_token_hash = ${h}
        and t.revoked_at is null
        and t.expires_at > now()`);

    if (!rows[0]) throw appError('unauthorized', 'Invalid or expired token.');
    return {
      userId: String(rows[0].user_id),
      clientId: String(rows[0].client_id),
      scope: String(rows[0].scope),
      clientName: String(rows[0].client_name),
    };
  }

  // ---------- Connector management ----------

  async listConnectors(
    userId: string,
  ): Promise<
    Array<{ client_id: string; client_name: string; redirect_host: string; connected_at: string }>
  > {
    const { rows } = await this.db.execute<Row>(sql`
      select distinct on (t.client_id) c.id as client_id, c.name as client_name,
        c.redirect_uris[1] as redirect_uri, t.created_at
      from oauth_tokens t
      join oauth_clients c on c.id = t.client_id
      where t.user_id = ${userId} and t.revoked_at is null
      order by t.client_id, t.created_at desc`);

    return rows.map((r) => {
      let host = '';
      try {
        host = new URL(String(r.redirect_uri)).host;
      } catch {
        /* fallback */
      }
      return {
        client_id: String(r.client_id),
        client_name: String(r.client_name),
        redirect_host: host,
        connected_at: String(r.created_at),
      };
    });
  }

  async disconnectClient(userId: string, clientId: string): Promise<void> {
    await this.db.execute(sql`
      update oauth_tokens set revoked_at = now()
      where user_id = ${userId} and client_id = ${clientId} and revoked_at is null`);
  }

  async disconnectAll(userId: string): Promise<void> {
    await this.db.execute(sql`
      update oauth_tokens set revoked_at = now()
      where user_id = ${userId} and revoked_at is null`);
  }

  // ---------- Helpers ----------

  private async getClient(clientId: string): Promise<OAuthClient | null> {
    const { rows } = await this.db.execute<Row>(sql`
      select id, name, redirect_uris, scope from oauth_clients where id = ${clientId}`);
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      redirect_uris: r.redirect_uris as string[],
      scope: String(r.scope),
    };
  }

  private async issueTokenPair(clientId: string, userId: string, scope: string, familyId?: string) {
    const accessToken = randomToken(32);
    const refreshTokenVal = randomToken(32);
    const fid = familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + ACCESS_TTL_S * 1000);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.execute(sql`
      insert into oauth_tokens (client_id, user_id, access_token_hash, refresh_token_hash, scope, expires_at, refresh_expires_at, family_id)
      values (${clientId}, ${userId}, ${this.hash(accessToken)}, ${this.hash(refreshTokenVal)}, ${scope}, ${expiresAt.toISOString()}::timestamptz, ${refreshExpiresAt.toISOString()}::timestamptz, ${fid}::uuid)`);

    await this.db.execute(sql`
      insert into audit_log (user_id, actor, action, target)
      values (${userId}, ${'ai:' + clientId}, 'oauth_token_issued', ${clientId})`);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenVal,
      token_type: 'bearer' as const,
      expires_in: ACCESS_TTL_S,
      scope,
    };
  }
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    // Allow loopback for desktop apps (RFC 8252)
    if (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
    )
      return true;
    return false;
  } catch {
    return false;
  }
}
