import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import type { OAuthService } from './service';
import { enqueue } from '../jobs/enqueue';

type Row = Record<string, unknown>;

export function connectorRoutes(
  app: FastifyInstance,
  db: Db,
  config: Config,
  jwt: JwtService,
  auth: AuthService,
  oauth: OAuthService,
  _now: () => Date,
) {
  const preHandler = requireApp(jwt, auth);

  app.get('/v1/connector', { preHandler }, async (req) => {
    const connectors = await oauth.listConnectors(req.auth!.userId);
    return { connectors };
  });

  app.delete('/v1/connector/:clientId', { preHandler }, async (req, reply) => {
    const { clientId } = req.params as { clientId: string };
    await oauth.disconnectClient(req.auth!.userId, clientId);

    await db.execute(sql`
      insert into audit_log (user_id, actor, action, target)
      values (${req.auth!.userId}, 'user', 'oauth_disconnect', ${clientId})`);

    return reply.code(204).send();
  });

  app.delete('/v1/connector', { preHandler }, async (req, reply) => {
    await oauth.disconnectAll(req.auth!.userId);

    await db.execute(sql`
      insert into audit_log (user_id, actor, action, target)
      values (${req.auth!.userId}, 'user', 'oauth_disconnect_all', ${req.auth!.userId})`);

    return reply.code(204).send();
  });

  app.post(
    '/v1/connector/test-draft',
    {
      preHandler,
      config: { rateLimit: { max: 3 * config.RATE_LIMIT_MULTIPLIER, timeWindow: '1 day' } },
    },
    async (req, reply) => {
      const userId = req.auth!.userId;

      // Create a sample plan
      const planId = randomUUID();
      const {
        rows: [revRow],
      } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
      const baseRevision = revRow ? Number(revRow.revision) : 0;

      await db.execute(sql`insert into plans
        (id, user_id, source, provider, client_name, request_text, status, base_revision,
         provider_mode, version, ready_at)
        values (${planId}, ${userId}, 'mcp', 'test',
          'Test draft', 'This is a test draft from the connector settings.', 'ready', ${baseRevision},
          'server', 1, now())`);

      // Sample change
      const changeId = randomUUID();
      await db.execute(sql`insert into plan_changes
        (id, plan_id, ord, kind, title, payload_json, note, enabled)
        values (${changeId}, ${planId}, 0, 'new', 'Sample block',
          ${JSON.stringify({ start: '10:00', end: '11:00' })}::jsonb,
          'This is a test change to verify your connector works.', true)`);

      // Enqueue push
      await enqueue(
        db,
        'push.chat_draft',
        {
          plan_id: planId,
          user_id: userId,
          client_name: 'Test draft',
          change_count: 1,
          term_name: 'your schedule',
        },
        { dedupeKey: `test_draft:${planId}` },
      );

      return reply.code(201).send({ plan_id: planId });
    },
  );
}
