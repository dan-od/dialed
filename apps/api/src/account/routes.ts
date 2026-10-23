import type { FastifyInstance } from 'fastify';
import { DevicePut } from '@dialed/contracts';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import { parse } from '../lib/validate';
import type { AccountService } from './service';

export function accountRoutes(
  app: FastifyInstance,
  account: AccountService,
  jwt: JwtService,
  auth: AuthService,
) {
  const preHandler = requireApp(jwt, auth);
  app.get('/v1/devices/current', { preHandler }, async (req) => ({
    prefs: await account.getPrefs(req.auth!.userId, req.auth!.sid),
  }));
  app.put('/v1/devices/current', { preHandler }, async (req) => ({
    prefs: await account.putPrefs(req.auth!.userId, req.auth!.sid, parse(DevicePut, req.body)),
  }));
  // Streamed straight to the phone's share sheet: never cached (Cloudflare included), no signed URL.
  app.get('/v1/account/export', { preHandler }, async (req, reply) => {
    const zip = await account.exportZip(req.auth!.userId);
    return reply
      .header('content-type', 'application/zip')
      .header('cache-control', 'no-store')
      .header('content-disposition', 'attachment; filename="dialed-export.zip"')
      .send(Buffer.from(zip));
  });
}
