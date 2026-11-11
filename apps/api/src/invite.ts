// Usage (home lab): docker compose run --rm api node dist/invite.js me@example.com
import pg from 'pg';
import { inviteEmail } from './ops/invite';

const email = process.argv[2];
if (!email || process.argv.length > 3) {
  console.error('Usage: node dist/invite.js <email>');
  process.exit(2);
}
if (process.env.SIGNUP_MODE && process.env.SIGNUP_MODE !== 'invite') {
  console.error(
    `Note: SIGNUP_MODE=${process.env.SIGNUP_MODE}; invites only matter with SIGNUP_MODE=invite.`,
  );
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const r = await inviteEmail(client, email);
  const said = {
    invited: 'Invited. They can sign up from the app with this email.',
    already_invited: 'Already invited (nothing changed).',
    already_registered: 'This email already has an account (nothing changed).',
  }[r.result];
  console.log(`${r.email}: ${said}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
