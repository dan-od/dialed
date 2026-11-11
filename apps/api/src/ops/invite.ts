import type pg from 'pg';
import { z } from 'zod';

const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export type InviteResult = {
  email: string;
  result: 'invited' | 'already_invited' | 'already_registered';
};

/** Adds an invite for SIGNUP_MODE=invite. Idempotent: a second run reports what is already there. */
export async function inviteEmail(client: pg.ClientBase, raw: string): Promise<InviteResult> {
  const parsed = Email.safeParse(raw);
  if (!parsed.success) throw new Error('Give one valid email address.');
  const email = parsed.data;
  const user = await client.query(`select 1 from users where email = $1 and status = 'active'`, [
    email,
  ]);
  if (user.rowCount) return { email, result: 'already_registered' };
  const ins = await client.query(
    'insert into invites(email) values ($1) on conflict (email) do nothing',
    [email],
  );
  return { email, result: ins.rowCount ? 'invited' : 'already_invited' };
}
