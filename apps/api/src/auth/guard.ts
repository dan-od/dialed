import type { FastifyRequest } from 'fastify';
import { appError } from '../lib/errors';
import type { AuthService } from './service';
import type { JwtService } from './jwt';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; sid: string };
  }
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(h);
  return m ? m[1]! : null;
}

/** preHandler for every app route: app-audience JWT + live session. Fills req.auth. */
export function requireApp(jwt: JwtService, auth: AuthService) {
  return async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw appError('unauthorized');
    const claims = await jwt.verify(token);
    await auth.assertSessionActive(claims.sid, claims.sub);
    req.auth = { userId: claims.sub, sid: claims.sid };
  };
}
