import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { TokensOut } from '@dialed/contracts';
import type { Config } from '../config';
import type { Db, Tx } from '../db/pool';
import { categories, devices, emailCodes, invites, sessions, users } from '../db/schema';
import type { EmailTransport } from '../email';
import { hashesEqual, pepperedHash, randomToken, sixDigitCode } from '../lib/crypto';
import { appError } from '../lib/errors';
import { ChangeRecorder } from '../sync/record';
import { DEFAULT_CATEGORIES } from './defaults';
import { ACCESS_TTL_SECONDS, type JwtService } from './jwt';
import { hashPassword, isCommonPassword, verifyPassword } from './passwords';

const CODE_TTL_MIN = 10;
const RESET_TTL_MIN = 30;
const REFRESH_TTL_DAYS = 60;
const MAX_ATTEMPTS = 5;

type UserRow = typeof users.$inferSelect;

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly email: EmailTransport,
    private readonly config: Config,
  ) {}

  private hash(v: string) {
    return pepperedHash(this.config.CODE_PEPPER, v);
  }

  private async findActiveUser(email: string): Promise<UserRow | undefined> {
    const [u] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, 'active')));
    return u;
  }

  // ---------- sign up / verify ----------

  async signup(input: { name: string; email: string; password: string }): Promise<void> {
    if (isCommonPassword(input.password)) {
      throw appError('bad_request', 'Pick a less common password.', {
        fields: { password: 'Pick a less common password.' },
      });
    }
    if (this.config.SIGNUP_MODE === 'invite') {
      const [inv] = await this.db.select().from(invites).where(eq(invites.email, input.email));
      if (!inv) throw appError('invite_required');
    }
    const passwordHash = await hashPassword(input.password);
    const existing = await this.findActiveUser(input.email);
    if (existing?.email_verified_at)
      throw appError('email_taken', `There’s already an account for ${input.email}.`);

    await this.db.transaction(async (tx) => {
      let userId: string;
      if (existing) {
        // Unverified re-signup (app killed before verify): keep the account, refresh name/password.
        await tx
          .update(users)
          .set({ display_name: input.name, password_hash: passwordHash })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
        const [u] = await tx
          .insert(users)
          .values({ email: input.email, display_name: input.name, password_hash: passwordHash })
          .returning();
        userId = u!.id;
        await this.createDefaults(tx, userId);
      }
      await this.issueCode(tx, input.email, userId);
    });
  }

  /** C-0102: default categories only, no term; written through recordChange so sync sees them. */
  private async createDefaults(tx: Tx, userId: string) {
    const rec = new ChangeRecorder(tx, userId);
    const rows = await tx
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, user_id: userId, sort: i })))
      .returning();
    for (const row of rows) await rec.record('category', row.id, 'upsert', row);
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    await rec.record('profile', userId, 'upsert', u!);
  }

  private async issueCode(tx: Tx | Db, email: string, userId: string | null) {
    const code = sixDigitCode();
    await tx
      .update(emailCodes)
      .set({ consumed_at: sql`now()` })
      .where(
        and(
          eq(emailCodes.email, email),
          eq(emailCodes.purpose, 'verify'),
          isNull(emailCodes.consumed_at),
        ),
      );
    await tx.insert(emailCodes).values({
      email,
      user_id: userId,
      purpose: 'verify',
      code_hash: this.hash(code),
      expires_at: sql`now() + make_interval(mins => ${CODE_TTL_MIN})`,
    });
    await this.email.send({
      to: email,
      subject: `${code} is your ${this.config.APP_NAME} code`,
      text: `Your ${this.config.APP_NAME} code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`,
      meta: { kind: 'verify_code', code },
    });
  }

  /** 1/min and 5/hour per email (SECURITY.md). */
  private async assertResendAllowed(email: string, purpose: 'verify' | 'reset') {
    const { rows } = await this.db.execute<{ last_min: number; last_hour: number }>(sql`
      select count(*) filter (where created_at > now() - interval '1 minute')::int as last_min,
             count(*) filter (where created_at > now() - interval '1 hour')::int as last_hour
      from email_codes where email = ${email} and purpose = ${purpose}`);
    const r = rows[0]!;
    if (r.last_min >= 1 || r.last_hour >= 5) throw appError('rate_limited');
  }

  async resend(email: string, purpose: 'verify' | 'reset'): Promise<void> {
    const u = await this.findActiveUser(email);
    if (purpose === 'reset') return this.forgot(email);
    if (!u || u.email_verified_at) return; // no enumeration: same 202
    await this.assertResendAllowed(email, 'verify');
    await this.issueCode(this.db, email, u.id);
  }

  async verify(input: { email: string; code: string; time_zone?: string }): Promise<TokensOut> {
    return this.db
      .transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(emailCodes)
          .where(
            and(
              eq(emailCodes.email, input.email),
              eq(emailCodes.purpose, 'verify'),
              isNull(emailCodes.consumed_at),
              gt(emailCodes.expires_at, sql`now()`),
            ),
          )
          .orderBy(desc(emailCodes.created_at))
          .limit(1)
          .for('update');
        if (!row) throw appError('code_expired');
        if (row.attempts >= MAX_ATTEMPTS) {
          // 6th try: consume the code, answer code_invalid (SECURITY.md) — never a 500.
          await tx
            .update(emailCodes)
            .set({ consumed_at: sql`now()` })
            .where(eq(emailCodes.id, row.id));
          return { invalid: true } as const;
        }
        if (!hashesEqual(row.code_hash, this.hash(input.code))) {
          await tx
            .update(emailCodes)
            .set({ attempts: row.attempts + 1 })
            .where(eq(emailCodes.id, row.id));
          return { invalid: true } as const;
        }
        await tx
          .update(emailCodes)
          .set({ consumed_at: sql`now()` })
          .where(eq(emailCodes.id, row.id));
        const u = await this.findActiveUser(input.email);
        if (!u) throw appError('code_expired');
        const tz = input.time_zone && isValidZone(input.time_zone) ? input.time_zone : u.time_zone;
        const [verified] = await tx
          .update(users)
          .set({
            email_verified_at: sql`now()`,
            time_zone: tz,
            ...(tz !== u.time_zone ? { version: u.version + 1 } : {}),
          })
          .where(eq(users.id, u.id))
          .returning();
        if (tz !== u.time_zone)
          await new ChangeRecorder(tx, u.id).record('profile', u.id, 'upsert', verified!);
        await tx
          .update(invites)
          .set({ used_at: sql`now()` })
          .where(and(eq(invites.email, input.email), isNull(invites.used_at)));
        return { tokens: await this.startSession(tx, verified!, true) } as const;
      })
      .then((r) => {
        if ('invalid' in r) throw appError('code_invalid');
        return r.tokens;
      });
  }

  // ---------- sign in ----------

  async login(input: { email: string; password: string; time_zone?: string }): Promise<TokensOut> {
    const u = await this.findActiveUser(input.email);
    const ok = await verifyPassword(u?.password_hash ?? null, input.password);
    if (!u || !ok) throw appError('bad_credentials');
    if (!u.email_verified_at) {
      await this.assertResendAllowed(input.email, 'verify').then(
        () => this.issueCode(this.db, input.email, u.id),
        () => undefined, // a recent code is still valid
      );
      throw appError('forbidden', 'Check your inbox for a code to finish signing up.', {
        verify_required: true,
      });
    }
    return this.db.transaction((tx) => this.startSession(tx, u, false));
  }

  async exists(email: string): Promise<boolean> {
    return Boolean(await this.findActiveUser(email));
  }

  // ---------- sessions ----------

  private async startSession(
    tx: Tx,
    u: UserRow,
    isNew: boolean,
    familyId?: string,
  ): Promise<TokensOut> {
    const [device] = await tx.insert(devices).values({ user_id: u.id }).returning();
    const refresh = randomToken();
    const [s] = await tx
      .insert(sessions)
      .values({
        user_id: u.id,
        family_id: familyId ?? sql`gen_random_uuid()`,
        refresh_token_hash: this.hash(refresh),
        device_id: device!.id,
        expires_at: sql`now() + make_interval(days => ${REFRESH_TTL_DAYS})`,
      })
      .returning();
    return this.tokens(u, s!.id, refresh, isNew);
  }

  private async tokens(
    u: UserRow,
    sid: string,
    refresh: string,
    isNew: boolean,
  ): Promise<TokensOut> {
    return {
      access_token: await this.jwt.sign({ sub: u.id, sid, scope: 'app' }),
      refresh_token: refresh,
      expires_in: ACCESS_TTL_SECONDS,
      user: { id: u.id, email: u.email, display_name: u.display_name, time_zone: u.time_zone },
      is_new: isNew,
    };
  }

  async refresh(refreshToken: string): Promise<TokensOut> {
    const h = this.hash(refreshToken);
    const result = await this.db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.refresh_token_hash, h))
        .for('update');
      if (!s) return { error: 'unauthorized' } as const;
      if (s.revoked_at) {
        // Reuse of a rotated (or revoked) token: revoke the whole family.
        await tx
          .update(sessions)
          .set({ revoked_at: sql`now()` })
          .where(and(eq(sessions.family_id, s.family_id), isNull(sessions.revoked_at)));
        return { error: 'unauthorized' } as const;
      }
      if (new Date(s.expires_at) <= new Date()) return { error: 'unauthorized' } as const;
      const [u] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, s.user_id), eq(users.status, 'active')));
      if (!u) return { error: 'unauthorized' } as const;
      const refresh = randomToken();
      const [next] = await tx
        .insert(sessions)
        .values({
          user_id: u.id,
          family_id: s.family_id,
          refresh_token_hash: this.hash(refresh),
          device_id: s.device_id,
          expires_at: sql`now() + make_interval(days => ${REFRESH_TTL_DAYS})`,
        })
        .returning();
      await tx
        .update(sessions)
        .set({ revoked_at: sql`now()`, replaced_by: next!.id, last_used_at: sql`now()` })
        .where(eq(sessions.id, s.id));
      return { tokens: await this.tokens(u, next!.id, refresh, false) } as const;
    });
    if ('error' in result) throw appError('unauthorized', 'You were signed out. Sign in again.');
    return result.tokens;
  }

  /** Access tokens are short-lived but must stop working at once after logout / family revoke. */
  async assertSessionActive(sid: string, userId: string): Promise<void> {
    const { rows } = await this.db.execute<{ ok: boolean }>(sql`
      select true as ok from sessions s join users u on u.id = s.user_id
      where s.id = ${sid} and s.user_id = ${userId} and u.status = 'active'
        and exists (select 1 from sessions f where f.family_id = s.family_id and f.revoked_at is null)`);
    if (!rows[0]) throw appError('unauthorized', 'You were signed out. Sign in again.');
  }

  async logout(sid: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [s] = await tx
        .update(sessions)
        .set({ revoked_at: sql`now()` })
        .where(and(eq(sessions.id, sid), eq(sessions.user_id, userId)))
        .returning();
      // Revoke the rest of the rotation chain for this sign-in too.
      if (s)
        await tx
          .update(sessions)
          .set({ revoked_at: sql`now()` })
          .where(and(eq(sessions.family_id, s.family_id), isNull(sessions.revoked_at)));
      if (s?.device_id)
        await tx
          .update(devices)
          .set({ apns_token: null, live_activity_start_token: null })
          .where(eq(devices.id, s.device_id));
    });
  }

  // ---------- password reset ----------

  async forgot(email: string): Promise<void> {
    const u = await this.findActiveUser(email);
    if (!u) return;
    try {
      await this.assertResendAllowed(email, 'reset');
    } catch {
      return; // always 202; silently drop over-limit requests
    }
    const token = randomToken();
    await this.db.insert(emailCodes).values({
      email,
      user_id: u.id,
      purpose: 'reset',
      code_hash: this.hash(token),
      expires_at: sql`now() + make_interval(mins => ${RESET_TTL_MIN})`,
    });
    // Token in the URL fragment: never reaches server or Cloudflare logs.
    const url = `${this.config.PUBLIC_BASE_URL}/reset#token=${token}`;
    await this.email.send({
      to: email,
      subject: `Reset your ${this.config.APP_NAME} password`,
      text: `Open this link on your iPhone to pick a new password: ${url}\nIt works once and expires in ${RESET_TTL_MIN} minutes.`,
      meta: { kind: 'reset_link', url },
    });
  }

  async reset(token: string, password: string): Promise<TokensOut> {
    if (isCommonPassword(password)) {
      throw appError('bad_request', 'Pick a less common password.', {
        fields: { password: 'Pick a less common password.' },
      });
    }
    const passwordHash = await hashPassword(password);
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(emailCodes)
        .where(
          and(
            eq(emailCodes.code_hash, this.hash(token)),
            eq(emailCodes.purpose, 'reset'),
            isNull(emailCodes.consumed_at),
            gt(emailCodes.expires_at, sql`now()`),
          ),
        )
        .for('update');
      if (!row?.user_id) return null;
      await tx
        .update(emailCodes)
        .set({ consumed_at: sql`now()` })
        .where(eq(emailCodes.id, row.id));
      const [u] = await tx
        .update(users)
        .set({ password_hash: passwordHash })
        .where(and(eq(users.id, row.user_id), eq(users.status, 'active')))
        .returning();
      if (!u) return null;
      await tx
        .update(sessions)
        .set({ revoked_at: sql`now()` })
        .where(and(eq(sessions.user_id, u.id), isNull(sessions.revoked_at)));
      return this.startSession(tx, u, false);
    });
    if (!result) throw appError('code_expired', 'That link expired. Ask for a new one.');
    return result;
  }
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
