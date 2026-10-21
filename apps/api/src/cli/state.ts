// Prints a digest of the dev database state so bootstrap can prove a second run changes nothing.
import pg from 'pg';
import { schemaFingerprint } from '../db/migrator';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const exists = await client.query(`select to_regclass('public.users') is not null as ok`);
  if (!exists.rows[0].ok) {
    console.log(JSON.stringify({ digest: 'empty', fingerprint: null }));
  } else {
    const { rows } = await client.query<{ d: string }>(`select md5(concat_ws('|',
      (select string_agg(version||':'||sha256, ',' order by version) from schema_migrations),
      (select string_agg(id::text||':'||version||':'||coalesce(password_hash,''), ',' order by id) from users),
      (select string_agg(id::text||':'||version, ',' order by id) from categories),
      (select string_agg(id::text||':'||version, ',' order by id) from terms),
      (select string_agg(id::text||':'||version, ',' order by id) from routines),
      (select string_agg(id::text||':'||version, ',' order by id) from routine_blocks),
      (select string_agg(id::text||':'||version, ',' order by id) from overrides),
      (select string_agg(id::text||':'||version, ',' order by id) from plans),
      (select string_agg(email::text, ',' order by email) from invites),
      (select string_agg(user_id::text||':'||revision, ',' order by user_id) from revisions)
    )) as d`);
    console.log(
      JSON.stringify({ digest: rows[0]!.d, fingerprint: await schemaFingerprint(client) }),
    );
  }
} finally {
  await client.end();
}
