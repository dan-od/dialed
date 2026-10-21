import type { FastifyInstance } from 'fastify';
import { PullQuery, PushBody } from '@dialed/contracts';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import { parse } from '../lib/validate';
import type { SyncService } from './service';

export function syncRoutes(
  app: FastifyInstance,
  sync: SyncService,
  jwt: JwtService,
  auth: AuthService,
) {
  const preHandler = requireApp(jwt, auth);
  app.get('/v1/sync/pull', { preHandler }, async (req) => {
    const q = parse(PullQuery, req.query);
    return sync.pull(req.auth!.userId, q.since, q.limit, q.cursor);
  });
  app.post('/v1/sync/push', { preHandler }, async (req) =>
    sync.push(req.auth!.userId, parse(PushBody, req.body).mutations),
  );
}
