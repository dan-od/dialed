import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';

export interface MigrationFile {
  version: string;
  sha256: string;
  sql: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

const FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;
const LOCK_KEY = 482_017_3; // pg_advisory_xact_lock key for migrations

export function readMigrations(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => FILE.test(f))
    .sort()
    .map((f) => {
      const sql = readFileSync(join(dir, f), 'utf8');
      return {
        version: FILE.exec(f)![1]!,
        sha256: createHash('sha256').update(sql).digest('hex'),
        sql,
      };
    });
}

/**
 * Migration files carry their own BEGIN/COMMIT. To record the version atomically with the schema change,
 * the runner strips that outer pair in memory (the file on disk and its checksum are untouched).
 */
function unwrap(sql: string): string {
  const lines = sql.split('\n');
  const first = lines.findIndex((l) => /^\s*BEGIN;\s*$/i.test(l));
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--)
    if (/^\s*COMMIT;\s*$/i.test(lines[i]!)) {
      last = i;
      break;
    }
  if (first === -1 || last === -1 || last < first) return sql;
  return [...lines.slice(0, first), ...lines.slice(first + 1, last), ...lines.slice(last + 1)].join(
    '\n',
  );
}

export async function migrate(client: pg.ClientBase, dir: string): Promise<MigrateResult> {
  const files = readMigrations(dir);
  const result: MigrateResult = { applied: [], skipped: [] };
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const file of files) {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await client.query<{ sha256: string }>(
        'SELECT sha256 FROM schema_migrations WHERE version = $1',
        [file.version],
      );
      if (rows[0]) {
        if (rows[0].sha256 !== file.sha256) {
          throw new Error(
            `Refusing to run: applied migration ${file.version} changed on disk (checksum mismatch). Write a new forward migration instead.`,
          );
        }
        result.skipped.push(file.version);
        await client.query('COMMIT');
        continue;
      }
      await client.query(unwrap(file.sql));
      await client.query('INSERT INTO schema_migrations(version, sha256) VALUES ($1, $2)', [
        file.version,
        file.sha256,
      ]);
      await client.query('COMMIT');
      result.applied.push(file.version);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  return result;
}

export const FINGERPRINT_SQL = `select md5(string_agg(table_name||':'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, ordinal_position)) as fp from information_schema.columns where table_schema='public' and table_name <> 'schema_migrations'`;

export async function schemaFingerprint(client: pg.ClientBase): Promise<string> {
  const { rows } = await client.query<{ fp: string }>(FINGERPRINT_SQL);
  return rows[0]!.fp;
}
