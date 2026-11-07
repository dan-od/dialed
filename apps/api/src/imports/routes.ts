import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { localNow } from '@dialed/schedule';
import {
  extractTimetable,
  classesToPlanChanges,
  detectFileKind,
  validateDocxSafety,
  termNameFromDate,
  newTermDates,
  createFixtureProvider,
} from '@dialed/planning';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import type { Config } from '../config';
import type { Db } from '../db/pool';
import { AppError } from '../lib/errors';
import { parse } from '../lib/validate';
import { PlanService } from '../plans/service';
import { findByIdempotencyKey } from '../plans/idempotency';
import { dailyImportCount, incrementUsage } from '../plans/usage';

type Row = Record<string, unknown>;

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const activeTimetableImports = new Set<string>();

const CalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  start: z.string(),
  end: z.string(),
  rrule: z.string().optional(),
  calendar: z.string().optional(),
});

const CalendarImportBody = z.object({
  events: z.array(CalendarEventSchema).min(1).max(500),
  term_id: z.string().optional(),
});
type CalendarImportBody = z.infer<typeof CalendarImportBody>;

export function importsRoutes(
  app: FastifyInstance,
  db: Db,
  config: Config,
  jwt: JwtService,
  auth: AuthService,
  now: () => Date,
) {
  const preHandler = requireApp(jwt, auth);
  const planService = new PlanService(db, config, now);

  void app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

  const userTz = async (userId: string) => {
    const {
      rows: [u],
    } = await db.execute(sql`select time_zone from users where id = ${userId}`);
    return ((u as Row)?.time_zone as string) ?? 'America/Toronto';
  };

  app.post('/v1/imports/timetable', { preHandler }, async (req, reply) => {
    const userId = req.auth!.userId;
    const tz = await userTz(userId);
    const today = localNow(now(), tz).date;

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(db, userId, idempotencyKey);
      if (existing) {
        const plan = await planService.get(userId, existing, tz);
        return reply.code(200).send(plan);
      }
    }

    const count = await dailyImportCount(db, userId, today);
    if (count >= config.IMPORT_DAILY_LIMIT) {
      throw new AppError(
        'daily_limit',
        `You've used today's ${config.IMPORT_DAILY_LIMIT} timetable reads. Try again tomorrow or bring your own AI key in Settings.`,
      );
    }

    if (activeTimetableImports.has(userId)) {
      throw new AppError('conflict', 'A timetable import is already running.');
    }

    let filePart;
    try {
      filePart = await req.file();
    } catch {
      throw new AppError('bad_request', 'Send a file.');
    }
    if (!filePart) throw new AppError('bad_request', 'Send a file.');

    const chunks: Buffer[] = [];
    let totalSize = 0;
    for await (const chunk of filePart.file) {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        throw new AppError('file_too_large');
      }
      chunks.push(chunk);
    }
    // @fastify/multipart stops the stream at the limit instead of erroring; a cut-off file is too large.
    if (filePart.file.truncated) throw new AppError('file_too_large');
    const fileBuf = Buffer.concat(chunks);

    const fileKind = detectFileKind(fileBuf);
    if (!fileKind) {
      throw new AppError('file_unsupported');
    }

    if (fileKind === 'docx') {
      try {
        validateDocxSafety(fileBuf);
      } catch {
        throw new AppError('file_unsupported', 'That file can’t be read safely.');
      }
    }

    const fileId = randomUUID();
    const uploadDir = config.UPLOAD_DIR;
    await mkdir(uploadDir, { recursive: true, mode: 0o700 });
    const filePath = join(uploadDir, fileId);

    activeTimetableImports.add(userId);
    try {
      await writeFile(filePath, fileBuf, { mode: 0o600 });

      let provider;
      if (config.AI_MODE === 'fixture') {
        const { readFileSync } = await import('node:fs');
        const fixtureDir = join(
          import.meta.dirname ?? __dirname,
          '..',
          '..',
          '..',
          '..',
          'backend',
          'seed',
          'fixtures',
          'timetable',
        );
        // Fixture variants are picked by file name so tests and Maestro can reach the
        // nothing-found and partial-read states (fixture mode only, never with a real provider).
        const variant = /empty/i.test(filePart.filename ?? '')
          ? '-empty'
          : /partial/i.test(filePart.filename ?? '')
            ? '-partial'
            : '';
        let fixtureResponse;
        try {
          fixtureResponse = readFileSync(
            join(fixtureDir, `fixture-response${variant}.json`),
            'utf8',
          );
        } catch {
          fixtureResponse = '{"classes":[],"term_hint":null}';
        }
        provider = {
          id: 'fixture' as const,
          displayName: 'Fixture',
          supportsVision: true,
          async run() {
            return {
              content: fixtureResponse,
              tool_calls: [] as never[],
              tokens_in: 100,
              tokens_out: 50,
            };
          },
        };
      } else {
        provider = createFixtureProvider('timetable');
      }

      const result = await extractTimetable({
        provider,
        fileBuf,
        fileName: filePart.filename ?? 'upload',
      });

      if (result.classes.length === 0) {
        const planId = randomUUID();
        const {
          rows: [revRow],
        } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
        const baseRevision = revRow ? Number(revRow.revision) : 0;
        await db.execute(sql`insert into plans
          (id, user_id, source, provider, request_text, status, base_revision,
           provider_mode, idempotency_key, version, error_code)
          values (${planId}, ${userId}, 'timetable', ${provider.id},
            ${'Timetable import'}, 'failed', ${baseRevision},
            'server', ${idempotencyKey ?? null}, 1, 'nothing_found')`);
        await incrementUsage(db, userId, today, result.tokensIn, result.tokensOut, 'imports');
        const plan = await planService.get(userId, planId, tz);
        return reply.code(200).send(plan);
      }

      // Find or create class category
      const { rows: classCats } = await db.execute<Row>(
        sql`select id from categories where user_id = ${userId} and name = 'Class' and deleted_at is null`,
      );
      const classCategoryId = classCats[0]?.id as string | undefined;

      // Term: use existing, or create one from the hint
      const { rows: existingTerms } = await db.execute<Row>(
        sql`select id, name, starts_on, ends_on from terms where user_id = ${userId} and deleted_at is null
            order by starts_on desc limit 1`,
      );
      const existingTerm = existingTerms[0];

      let termStart: string;
      let termEnd: string;
      let termName: string;
      let createTermChange = false;

      if (existingTerm) {
        termStart = String(existingTerm.starts_on);
        termEnd = String(existingTerm.ends_on);
        termName = String(existingTerm.name);
      } else {
        ({ starts: termStart, ends: termEnd } = newTermDates(result.termHint, today));
        termName = termNameFromDate(termStart);
        createTermChange = true;
      }

      const changes = [];

      if (!classCategoryId) {
        changes.push({
          kind: 'create_category' as const,
          title: 'Class',
          new_category: {
            temp_id: 'cat-class',
            name: 'Class',
            group: 'School',
            palette: 'Blue' as const,
          },
          note: 'Classes imported from your timetable.',
        });
      }

      if (existingTerm) {
        // Always carried so Found classes can edit the dates (PATCH payload); a no-op if unchanged.
        changes.push({
          kind: 'update_term' as const,
          title: termName,
          term_id: String(existingTerm.id),
          starts_on: termStart,
          ends_on: termEnd,
          note: `Classes run inside ${termName}.`,
        });
      }

      if (createTermChange) {
        changes.push({
          kind: 'create_term' as const,
          title: termName,
          new_term: {
            temp_id: 'term-new',
            name: termName,
            starts_on: termStart,
            ends_on: termEnd,
          },
          note: `New term starting ${termStart}.`,
        });
      }

      const catId = classCategoryId ?? 'cat-class';
      const firstClassOrd = changes.length;
      changes.push(...classesToPlanChanges(result.classes, catId, termStart, termEnd));

      const {
        rows: [revRow],
      } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
      const baseRevision = revRow ? Number(revRow.revision) : 0;

      const planId = randomUUID();
      await db.execute(sql`insert into plans
        (id, user_id, source, provider, request_text, status, base_revision,
         provider_mode, idempotency_key, version)
        values (${planId}, ${userId}, 'timetable', ${provider.id},
          ${'Timetable import'}, 'drafting', ${baseRevision},
          'server', ${idempotencyKey ?? null}, 1)`);

      // Check id names the change's position so the client marks exactly that card.
      const checks = result.classes.flatMap((c, i) =>
        c.confidence !== undefined && c.confidence < 0.7
          ? [
              {
                id: `low_confidence:${firstClassOrd + i}`,
                passed: false,
                detail: `${c.title} on ${c.weekday} ${c.start} was hard to read.`,
              },
            ]
          : [],
      );

      await planService.storeResult(
        planId,
        userId,
        'ready',
        changes,
        checks,
        result.tokensIn,
        result.tokensOut,
        { skipUsage: true },
      );
      await incrementUsage(db, userId, today, result.tokensIn, result.tokensOut, 'imports');

      const plan = await planService.get(userId, planId, tz);
      return reply.code(201).send(plan);
    } finally {
      activeTimetableImports.delete(userId);
      try {
        await unlink(filePath);
      } catch {
        /* cleanup best-effort */
      }
    }
  });

  app.post('/v1/imports/calendar', { preHandler }, async (req, reply) => {
    const userId = req.auth!.userId;
    const tz = await userTz(userId);
    const today = localNow(now(), tz).date;
    const body = parse(CalendarImportBody, req.body);

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(db, userId, idempotencyKey);
      if (existing) {
        const plan = await planService.get(userId, existing, tz);
        return reply.code(200).send(plan);
      }
    }

    // Find or create class category for calendar events
    const { rows: studyCats } = await db.execute<Row>(
      sql`select id, name from categories where user_id = ${userId} and deleted_at is null`,
    );
    const categoryMap = new Map(studyCats.map((c) => [String(c.name).toLowerCase(), String(c.id)]));
    const defaultCategoryId = categoryMap.get('study') ?? categoryMap.values().next().value;

    // Get existing term or figure one out
    const { rows: existingTerms } = await db.execute<Row>(
      sql`select id, name, starts_on, ends_on from terms where user_id = ${userId} and deleted_at is null
          order by starts_on desc limit 1`,
    );
    const existingTerm = existingTerms[0];

    let termStart: string;
    let termEnd: string;
    let termName: string;
    let createTermChange = false;

    if (existingTerm) {
      termStart = String(existingTerm.starts_on);
      termEnd = String(existingTerm.ends_on);
      termName = String(existingTerm.name);
    } else {
      termStart = today;
      const endDate = new Date(termStart + 'T12:00:00Z');
      endDate.setMonth(endDate.getMonth() + 3);
      termEnd = endDate.toISOString().split('T')[0]!;
      termName = termNameFromDate(termStart);
      createTermChange = true;
    }

    const changes = [];

    if (createTermChange) {
      changes.push({
        kind: 'create_term' as const,
        title: termName,
        new_term: {
          temp_id: 'term-new',
          name: termName,
          starts_on: termStart,
          ends_on: termEnd,
        },
        note: 'Created from calendar import.',
      });
    }

    const WEEKDAY_MAP: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
      '0': 'sun',
      '1': 'mon',
      '2': 'tue',
      '3': 'wed',
      '4': 'thu',
      '5': 'fri',
      '6': 'sat',
    };

    for (const event of body.events) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

      const durationMs = end.getTime() - start.getTime();
      if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) continue;

      const startH = start.getHours();
      const startM = Math.round(start.getMinutes() / 5) * 5;
      const endH = end.getHours();
      const endM = Math.round(end.getMinutes() / 5) * 5;
      const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      const title = event.title;
      const catId = matchCategory(title, categoryMap) ?? defaultCategoryId;

      if (event.rrule?.includes('FREQ=WEEKLY')) {
        const weekday = WEEKDAY_MAP[String(start.getDay())] ?? 'mon';
        changes.push({
          kind: 'new' as const,
          title,
          category_id: catId ?? 'cat-study',
          repeat: { weekday, from: termStart, until: termEnd },
          start: startStr,
          end: endStr,
          note: `Weekly from ${event.calendar ?? 'calendar'}.`,
        });
      } else {
        const dateStr = start.toISOString().split('T')[0]!;
        if (dateStr >= today) {
          changes.push({
            kind: 'new' as const,
            title,
            category_id: catId ?? 'cat-study',
            on_date: dateStr,
            start: startStr,
            end: endStr,
            note: `One-off from ${event.calendar ?? 'calendar'}.`,
          });
        }
      }
    }

    if (changes.length === 0 || (changes.length === 1 && createTermChange)) {
      throw new AppError('bad_request', 'No events found to import.');
    }

    const {
      rows: [revRow],
    } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
    const baseRevision = revRow ? Number(revRow.revision) : 0;

    const planId = randomUUID();
    await db.execute(sql`insert into plans
      (id, user_id, source, provider, request_text, status, base_revision,
       provider_mode, idempotency_key, version)
      values (${planId}, ${userId}, 'calendar', 'calendar',
        ${'Calendar import'}, 'drafting', ${baseRevision},
        'server', ${idempotencyKey ?? null}, 1)`);

    await planService.storeResult(planId, userId, 'ready', changes, [], 0, 0);

    const plan = await planService.get(userId, planId, tz);
    return reply.code(201).send(plan);
  });

  // Sweep job handler: delete orphaned uploads older than 1 hour
  app.post('/v1/internal/uploads/sweep', async (_req, reply) => {
    const uploadDir = config.UPLOAD_DIR;
    try {
      const files = await readdir(uploadDir);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      let deleted = 0;
      for (const f of files) {
        const fp = join(uploadDir, f);
        const s = await stat(fp);
        if (s.mtimeMs < oneHourAgo) {
          await unlink(fp);
          deleted++;
        }
      }
      return reply.send({ deleted });
    } catch {
      return reply.send({ deleted: 0 });
    }
  });
}

function matchCategory(title: string, categoryMap: Map<string, string>): string | undefined {
  const lower = title.toLowerCase();
  for (const [name, id] of categoryMap) {
    if (lower.includes(name)) return id;
  }
  return undefined;
}
