import type { FastifyInstance } from 'fastify';
import { ActivityPut, BLOCK_KEY, DevicePut } from '@dialed/contracts';
import type { LiveActivityService } from '../glance/activities';
import { appError } from '../lib/errors';
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
  activities: LiveActivityService,
) {
  const preHandler = requireApp(jwt, auth);
  app.get('/v1/devices/current', { preHandler }, async (req) => ({
    prefs: await account.getPrefs(req.auth!.userId, req.auth!.sid),
  }));
  app.put('/v1/devices/current', { preHandler }, async (req) =>
    account.putPrefs(req.auth!.userId, req.auth!.sid, parse(DevicePut, req.body)),
  );
  // Flow 08: the phone reports a Live Activity it started (with its per-activity token) or the Planner dismissed.
  app.put<{ Params: { blockKey: string } }>(
    '/v1/devices/current/activities/:blockKey',
    { preHandler },
    async (req) => {
      const { blockKey } = req.params;
      if (!BLOCK_KEY.test(blockKey)) throw appError('bad_request', 'That block key isn’t valid.');
      const body = parse(ActivityPut, req.body);
      const deviceId = await account.deviceId(req.auth!.userId, req.auth!.sid);
      return activities.report(req.auth!.userId, deviceId, blockKey, body);
    },
  );
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
