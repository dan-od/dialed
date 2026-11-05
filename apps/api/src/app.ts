import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { authRoutes } from './auth/routes';
import { JwtService } from './auth/jwt';
import { AuthService } from './auth/service';
import type { Config } from './config';
import type { Db } from './db/pool';
import type { EmailTransport } from './email';
import { AppError, appError } from './lib/errors';
import { syncRoutes } from './sync/routes';
import { accountRoutes } from './account/routes';
import { AccountService } from './account/service';
import { SyncService } from './sync/service';
import { plansRoutes } from './plans/routes';
import { importsRoutes } from './imports/routes';
import { testKeyRoute } from './plans/testkey';
import { publicRoutes } from './public';
import { oauthRoutes } from './oauth/routes';
import { connectorRoutes } from './oauth/connector';
import { mountMcp } from './mcp/server';

export interface Deps {
  pool: pg.Pool;
  db: Db;
  email: EmailTransport;
  now?: () => Date;
  /** Test hook: capture log lines. */
  logStream?: { write(line: string): void };
}

/** Redaction list (BACKEND_SETUP §11). Bodies are never logged; these cover headers and any structured fields. */
export const REDACT = [
  'req.headers.authorization',
  'req.headers["x-provider-key"]',
  'req.headers["x-provider-base-url"]',
  'req.headers.cookie',
  '*.password',
  '*.code',
  '*.token',
  '*.refresh_token',
  '*.access_token',
  '*.request_text',
  '*.identityToken',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function buildApp(config: Config, deps: Deps) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(deps.logStream ? { stream: deps.logStream } : {}),
      redact: { paths: REDACT, censor: '[redacted]' },
      serializers: {
        // Route without query string (reset tokens and cursors never reach logs).
        req: (req) => ({
          method: req.method,
          url: String(req.url).split('?')[0],
          request_id: req.id,
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
    trustProxy: config.TRUST_PROXY_IP ? [config.TRUST_PROXY_IP] : false,
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return typeof h === 'string' && UUID.test(h) ? h : randomUUID();
    },
    bodyLimit: 1_048_576,
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    // Cloudflare's client IP, trusted only from the cloudflared container (SECURITY.md).
    const cf = req.headers['cf-connecting-ip'];
    if (
      config.TRUST_PROXY_IP &&
      req.socket.remoteAddress === config.TRUST_PROXY_IP &&
      typeof cf === 'string'
    ) {
      (req as { clientIp?: string }).clientIp = cf;
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: 120 * config.RATE_LIMIT_MULTIPLIER,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req as { clientIp?: string }).clientIp ?? req.ip,
    errorResponseBuilder: () => appError('rate_limited').toBody(),
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send(err.toBody());
    if (err.statusCode === 429) return reply.code(429).send(appError('rate_limited').toBody());
    if (
      err.validation ||
      err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      err.statusCode === 400
    ) {
      return reply.code(400).send(appError('bad_request').toBody());
    }
    if (err.statusCode === 413)
      return reply.code(413).send(appError('bad_request', 'That request is too large.').toBody());
    req.log.error({ err: { message: err.message, code: err.code } }, 'unhandled error');
    return reply.code(500).send(appError('server_error').toBody()); // never a stack trace
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send(appError('not_found').toBody()));

  // OAuth token endpoint accepts application/x-www-form-urlencoded
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        done(null, Object.fromEntries(params));
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );

  const jwt = new JwtService(config.jwtPrivateKeyPem, config.JWT_KEY_ID, config.PUBLIC_BASE_URL);
  const auth = new AuthService(deps.db, jwt, deps.email, config);
  const sync = new SyncService(deps.db, deps.now);
  const account = new AccountService(deps.db, deps.now);

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await deps.pool.query('select 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  authRoutes(app, auth, jwt, config.RATE_LIMIT_MULTIPLIER);
  syncRoutes(app, sync, jwt, auth);
  accountRoutes(app, account, jwt, auth);
  plansRoutes(app, deps.db, config, jwt, auth, deps.now ?? (() => new Date()));
  importsRoutes(app, deps.db, config, jwt, auth, deps.now ?? (() => new Date()));
  testKeyRoute(app, config, jwt, auth);
  publicRoutes(app, config);

  const oauth = oauthRoutes(app, deps.db, config, jwt, auth);
  connectorRoutes(app, deps.db, config, jwt, auth, oauth, deps.now ?? (() => new Date()));
  mountMcp(app, deps.db, config, oauth, deps.now ?? (() => new Date()));

  return app;
}
