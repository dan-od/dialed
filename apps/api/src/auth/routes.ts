import type { FastifyInstance } from 'fastify';
import {
  ForgotBody,
  LoginBody,
  LoginCheckBody,
  RefreshBody,
  ResendBody,
  ResetBody,
  SignupBody,
  VerifyBody,
} from '@dialed/contracts';
import { parse } from '../lib/validate';
import { requireApp } from './guard';
import type { JwtService } from './jwt';
import type { AuthService } from './service';

const emailKey = new Map<string, number[]>();
/** login/check: 20/hour per email (in-process; per-IP limit comes from @fastify/rate-limit). */
function checkPerEmail(email: string, max: number): boolean {
  const now = Date.now();
  const hits = (emailKey.get(email) ?? []).filter((t) => now - t < 3_600_000);
  hits.push(now);
  emailKey.set(email, hits);
  return hits.length <= max;
}

export function authRoutes(app: FastifyInstance, auth: AuthService, jwt: JwtService, mult: number) {
  const strict = { rateLimit: { max: 30 * mult, timeWindow: '1 minute' } };

  app.post('/v1/auth/signup', { config: strict }, async (req, reply) => {
    await auth.signup(parse(SignupBody, req.body));
    return reply.code(202).send({ pending: true });
  });

  app.post('/v1/auth/verify', { config: strict }, async (req) =>
    auth.verify(parse(VerifyBody, req.body)),
  );

  app.post('/v1/auth/resend', { config: strict }, async (req, reply) => {
    const b = parse(ResendBody, req.body);
    await auth.resend(b.email, b.purpose);
    return reply.code(202).send({ pending: true });
  });

  app.post('/v1/auth/login', { config: strict }, async (req) =>
    auth.login(parse(LoginBody, req.body)),
  );

  app.post(
    '/v1/auth/login/check',
    { config: { rateLimit: { max: 5 * mult, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const b = parse(LoginCheckBody, req.body);
      if (!checkPerEmail(b.email, 20 * mult)) {
        return reply
          .code(429)
          .send({
            error: {
              code: 'rate_limited',
              message: 'Too many tries. Wait a minute and try again.',
              retryable: true,
            },
          });
      }
      return { exists: await auth.exists(b.email) };
    },
  );

  app.post('/v1/auth/password/forgot', { config: strict }, async (req, reply) => {
    await auth.forgot(parse(ForgotBody, req.body).email);
    return reply.code(202).send({ pending: true });
  });

  app.post('/v1/auth/password/reset', { config: strict }, async (req) => {
    const b = parse(ResetBody, req.body);
    return auth.reset(b.token, b.password);
  });

  app.post('/v1/auth/refresh', { config: strict }, async (req) =>
    auth.refresh(parse(RefreshBody, req.body).refresh_token),
  );

  app.post('/v1/auth/logout', { preHandler: requireApp(jwt, auth) }, async (req, reply) => {
    await auth.logout(req.auth!.sid, req.auth!.userId);
    return reply.code(204).send();
  });
}
