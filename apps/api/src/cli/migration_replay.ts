import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { migrate, readMigrations, schemaFingerprint } from '../db/migrator';

const ROOT = resolve(import.meta.dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'backend/migrations');
const db = `dialed_replay_${process.pid}`;
const base = new URL(process.env.DATABASE_URL!);
const admin = new URL(base);
admin.pathname = '/postgres';
const target = new URL(base);
target.pathname = `/${db}`;

const expected = Object.fromEntries(
  readFileSync(join(ROOT, 'verification/schema.fingerprint'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.trim().split(/\s+/) as [string, string]),
);
const files = readMigrations(MIGRATIONS);
const latest = files[files.length - 1]!.version;

const a = new pg.Client({ connectionString: admin.toString() });
await a.connect();
await a.query(`CREATE DATABASE ${db}`);
const report: Record<string, unknown> = {
  started_at: new Date().toISOString(),
  database: db,
  migrations: files.map((f) => ({ version: f.version, sha256: f.sha256 })),
};
let ok: boolean;
const tamperDir = mkdtempSync(join(tmpdir(), 'dialed-tamper-'));
try {
  const c = new pg.Client({ connectionString: target.toString() });
  await c.connect();
  try {
    const first = await migrate(c, MIGRATIONS);
    const second = await migrate(c, MIGRATIONS);
    const fingerprint = await schemaFingerprint(c);
    // A changed applied migration must be refused (forward-only rule).
    mkdirSync(join(tamperDir, 'm'));
    cpSync(MIGRATIONS, join(tamperDir, 'm'), { recursive: true });
    appendFileSync(join(tamperDir, 'm', `${files[0]!.version}.sql`), '\n-- tampered\n');
    let tamper = 'not refused';
    try {
      await migrate(c, join(tamperDir, 'm'));
    } catch (e) {
      tamper = (e as Error).message;
    }
    const applied = await c.query('select version, sha256 from schema_migrations order by version');
    Object.assign(report, {
      first_run: first,
      second_run: second,
      fingerprint,
      expected_fingerprint: expected[latest] ?? null,
      fingerprint_matches: expected[latest] === fingerprint,
      second_run_applied_nothing: second.applied.length === 0,
      tampered_checksum_refused: tamper.startsWith('Refusing to run'),
      tamper_message: tamper,
      applied: applied.rows,
    });
    ok =
      report.fingerprint_matches === true &&
      report.second_run_applied_nothing === true &&
      report.tampered_checksum_refused === true;
  } finally {
    await c.end();
  }
} finally {
  await a.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await a.end();
  rmSync(tamperDir, { recursive: true, force: true });
}
report.ok = ok;
report.finished_at = new Date().toISOString();
mkdirSync(join(ROOT, 'evidence/verification'), { recursive: true });
writeFileSync(
  join(ROOT, 'evidence/verification/migration_replay.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
if (!ok) process.exitCode = 1;
