import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import {
  CreatePlanBody,
  AnswerPlanBody,
  ReplyPlanBody,
  TogglePlanChangeBody,
  ApprovePlanBody,
  RecentPlansQuery,
} from '@dialed/contracts';
import { localNow } from '@dialed/schedule';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import type { Config } from '../config';
import type { Db } from '../db/pool';
import { parse } from '../lib/validate';
import { PlanService } from './service';
import { approvePlan, discardPlan } from './approve';
import { startPlanRun, initRunner } from './runner';

export function plansRoutes(
  app: FastifyInstance,
  db: Db,
  config: Config,
  jwt: JwtService,
  auth: AuthService,
  now: () => Date,
) {
  const preHandler = requireApp(jwt, auth);
  const service = new PlanService(db, config, now);
  initRunner(config);

  const userTz = async (userId: string) => {
    const { rows: [u] } = await db.execute(
      sql`select time_zone from users where id = ${userId}`,
    );
    return (u as Record<string, unknown>)?.time_zone as string ?? 'America/Toronto';
  };

  app.post('/v1/plans', { preHandler }, async (req, reply) => {
    const body = parse(CreatePlanBody, req.body);
    const userId = req.auth!.userId;
    const tz = await userTz(userId);

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const { planId, existing } = await service.create(
      userId, body.request_text, body.provider_mode, body.provider, idempotencyKey, tz,
    );

    if (!existing) {
      startPlanRun(db, config, service, planId, userId, body.request_text, tz, now).catch((err) => {
        req.log.error({ err: { message: (err as Error).message } }, 'plan run error');
      });
    }

    const plan = await service.get(userId, planId, tz);
    return reply.code(existing ? 200 : 201).send(plan);
  });

  app.get('/v1/plans', { preHandler }, async (req) => {
    const q = parse(RecentPlansQuery, req.query);
    return { plans: await service.list(req.auth!.userId, q.limit) };
  });

  app.get('/v1/plans/:id', { preHandler }, async (req) => {
    const { id } = req.params as { id: string };
    const tz = await userTz(req.auth!.userId);
    return service.get(req.auth!.userId, id, tz);
  });

  app.post('/v1/plans/:id/answer', { preHandler }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(AnswerPlanBody, req.body);
    const userId = req.auth!.userId;
    const answer = body.option ?? body.text!;
    await service.answer(userId, id, answer);

    const tz = await userTz(userId);
    const { rows: [plan] } = await db.execute(
      sql`select request_text from plans where id = ${id}`,
    );
    const requestText = String((plan as Record<string, unknown>)?.request_text ?? '');
    startPlanRun(db, config, service, id, userId, requestText, tz, now).catch((err) => {
      req.log.error({ err: { message: (err as Error).message } }, 'plan run error');
    });

    return service.get(userId, id, tz);
  });

  app.post('/v1/plans/:id/reply', { preHandler }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(ReplyPlanBody, req.body);
    const userId = req.auth!.userId;
    await service.reply(userId, id, body.text);

    const tz = await userTz(userId);
    const { rows: [plan] } = await db.execute(
      sql`select request_text from plans where id = ${id}`,
    );
    const requestText = String((plan as Record<string, unknown>)?.request_text ?? '');
    startPlanRun(db, config, service, id, userId, requestText, tz, now).catch((err) => {
      req.log.error({ err: { message: (err as Error).message } }, 'plan run error');
    });

    return service.get(userId, id, tz);
  });

  app.patch('/v1/plans/:id/changes/:cid', { preHandler }, async (req) => {
    const { id, cid } = req.params as { id: string; cid: string };
    const body = parse(TogglePlanChangeBody, req.body);
    if (body.enabled !== undefined) {
      await service.toggleChange(req.auth!.userId, id, cid, body.enabled);
    }
    const tz = await userTz(req.auth!.userId);
    return service.get(req.auth!.userId, id, tz);
  });

  app.post('/v1/plans/:id/approve', { preHandler }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(ApprovePlanBody, req.body);
    const tz = await userTz(req.auth!.userId);
    const today = localNow(now(), tz).date;
    const result = await approvePlan(db, req.auth!.userId, id, body.plan_version, today);
    return result;
  });

  app.post('/v1/plans/:id/discard', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await discardPlan(db, req.auth!.userId, id);
    return reply.code(204).send();
  });

  app.post('/v1/plans/:id/cancel', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.cancel(req.auth!.userId, id);
    return reply.code(204).send();
  });
}
