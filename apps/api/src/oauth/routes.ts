import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config';
import type { AuthService } from '../auth/service';
import type { JwtService } from '../auth/jwt';
import { parse } from '../lib/validate';
import { OAuthService } from './service';
import type { Db } from '../db/pool';
import { consentPage, signinPage } from './pages';

const RegisterBody = z.strictObject({
  client_name: z.string().trim().min(1).max(80),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.literal('none').optional(),
});

const TokenBody = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  client_id: z.string().min(1),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_verifier: z.string().optional(),
  refresh_token: z.string().optional(),
});

// CSRF token store (in-process; production would use a short-lived DB entry)
const csrfTokens = new Map<
  string,
  {
    clientId: string;
    clientName: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    state: string;
    createdAt: number;
  }
>();

export function oauthRoutes(
  app: FastifyInstance,
  db: Db,
  config: Config,
  jwt: JwtService,
  auth: AuthService,
) {
  const oauth = new OAuthService(db, config);
  const mult = config.RATE_LIMIT_MULTIPLIER;

  // ---------- Discovery ----------

  app.get('/.well-known/oauth-protected-resource', async () => ({
    resource: config.PUBLIC_BASE_URL,
    authorization_servers: [config.PUBLIC_BASE_URL],
    bearer_methods_supported: ['header'],
    scopes_supported: ['schedule:read', 'plans:draft'],
  }));

  app.get('/.well-known/oauth-authorization-server', async () => ({
    issuer: config.PUBLIC_BASE_URL,
    authorization_endpoint: `${config.PUBLIC_BASE_URL}/oauth/authorize`,
    token_endpoint: `${config.PUBLIC_BASE_URL}/oauth/token`,
    registration_endpoint: `${config.PUBLIC_BASE_URL}/oauth/register`,
    scopes_supported: ['schedule:read', 'plans:draft'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${config.PUBLIC_BASE_URL}/mcp`,
  }));

  // ---------- Dynamic Client Registration (RFC 7591) ----------

  app.post(
    '/oauth/register',
    { config: { rateLimit: { max: 10 * mult, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = parse(RegisterBody, req.body);
      const clientIp = (req as { clientIp?: string }).clientIp ?? req.ip;
      const result = await oauth.register(body.client_name, body.redirect_uris, clientIp);
      return reply.code(201).send(result);
    },
  );

  // ---------- Authorization endpoint ----------

  app.get('/oauth/authorize', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const clientId = q.client_id;
    const redirectUri = q.redirect_uri;
    const codeChallenge = q.code_challenge;
    const codeChallengeMethod = q.code_challenge_method;
    const state = q.state ?? '';
    const scope = q.scope ?? 'schedule:read plans:draft';
    const responseType = q.response_type;

    if (responseType !== 'code') {
      return reply
        .code(400)
        .type('text/html')
        .send(errorHtml('Only response_type=code is supported.'));
    }
    if (!clientId || !redirectUri || !codeChallenge) {
      return reply.code(400).type('text/html').send(errorHtml('Missing required parameters.'));
    }
    if (codeChallengeMethod !== 'S256') {
      return reply
        .code(400)
        .type('text/html')
        .send(errorHtml('Only S256 code challenge is supported.'));
    }

    // Exact client + redirect match before anything else: an unknown client or redirect gets an error
    // page here and is never redirected to (RFC 6749 §4.1.2.1; no open redirect via Cancel).
    const client = await oauth.getClient(clientId);
    if (!client || !client.redirect_uris.includes(redirectUri)) {
      return reply
        .code(400)
        .type('text/html')
        .send(errorHtml('This app isn’t set up correctly. Start over from your AI app.'));
    }

    const csrf = randomBytes(32).toString('hex');
    csrfTokens.set(csrf, {
      clientId,
      clientName: client.name,
      redirectUri,
      codeChallenge,
      scope,
      state,
      createdAt: Date.now(),
    });

    // Clean up old CSRF tokens (> 10 min)
    const cutoff = Date.now() - 600_000;
    for (const [k, v] of csrfTokens) {
      if (v.createdAt < cutoff) csrfTokens.delete(k);
    }

    return reply.type('text/html').send(signinPage(config, csrf));
  });

  app.post('/oauth/authorize', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const csrf = body.csrf_token;
    const email = body.email;
    const password = body.password;
    const action = body.action;

    const pending = csrf ? csrfTokens.get(csrf) : undefined;
    if (!pending) {
      return reply
        .code(400)
        .type('text/html')
        .send(errorHtml('Session expired. Start over from your AI app.'));
    }

    if (action === 'cancel') {
      csrfTokens.delete(csrf!);
      const url = new URL(pending.redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (pending.state) url.searchParams.set('state', pending.state);
      return reply.redirect(url.toString(), 302);
    }

    if (action === 'signin') {
      if (!email || !password) {
        return reply
          .type('text/html')
          .send(signinPage(config, csrf!, 'Enter your email and password.'));
      }
      try {
        const loginResult = await auth.login({ email, password });
        const consentCsrf = randomBytes(32).toString('hex');
        csrfTokens.set(consentCsrf, pending);
        csrfTokens.delete(csrf!);
        (csrfTokens.get(consentCsrf) as unknown as Record<string, unknown>).userId =
          loginResult.user.id;
        return reply
          .type('text/html')
          .send(
            consentPage(
              config,
              consentCsrf,
              pending.clientName,
              new URL(pending.redirectUri).host,
              pending.scope,
            ),
          );
      } catch (e) {
        const msg =
          e instanceof Error && 'code' in e ? 'Wrong email or password.' : 'Sign in failed.';
        return reply.type('text/html').send(signinPage(config, csrf!, msg));
      }
    }

    if (action === 'allow') {
      const userId = (pending as unknown as Record<string, unknown>).userId as string | undefined;
      if (!userId) {
        return reply.code(400).type('text/html').send(errorHtml('Session expired. Start over.'));
      }
      csrfTokens.delete(csrf!);

      const code = await oauth.createCode(
        pending.clientId,
        userId,
        pending.redirectUri,
        pending.codeChallenge,
        pending.scope,
      );

      const url = new URL(pending.redirectUri);
      url.searchParams.set('code', code);
      if (pending.state) url.searchParams.set('state', pending.state);
      return reply.redirect(url.toString(), 302);
    }

    return reply.code(400).type('text/html').send(errorHtml('Unknown action.'));
  });

  // ---------- Token endpoint ----------

  app.post(
    '/oauth/token',
    { config: { rateLimit: { max: 60 * mult, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parseTokenBody(req.body);

      if (body.grant_type === 'authorization_code') {
        if (!body.code || !body.redirect_uri || !body.code_verifier) {
          return reply.code(400).send({
            error: 'invalid_request',
            error_description: 'Missing code, redirect_uri or code_verifier.',
          });
        }
        try {
          const result = await oauth.exchangeCode(
            body.client_id,
            body.code,
            body.redirect_uri,
            body.code_verifier,
          );
          return result;
        } catch (e) {
          return reply
            .code(400)
            .send({ error: 'invalid_grant', error_description: (e as Error).message });
        }
      }

      if (body.grant_type === 'refresh_token') {
        if (!body.refresh_token) {
          return reply
            .code(400)
            .send({ error: 'invalid_request', error_description: 'Missing refresh_token.' });
        }
        try {
          return await oauth.refreshToken(body.client_id, body.refresh_token);
        } catch (e) {
          return reply
            .code(400)
            .send({ error: 'invalid_grant', error_description: (e as Error).message });
        }
      }

      return reply.code(400).send({ error: 'unsupported_grant_type' });
    },
  );

  return oauth;
}

function parseTokenBody(body: unknown): z.infer<typeof TokenBody> {
  // Token endpoint accepts both JSON and form-urlencoded
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    return TokenBody.parse(Object.fromEntries(params));
  }
  return TokenBody.parse(body);
}

function errorHtml(msg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title></head><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px"><h1 style="font-size:1.25rem">Something went wrong</h1><p>${escapeHtml(msg)}</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
