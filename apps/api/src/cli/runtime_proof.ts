// Gate 3 runtime proof: scripted journeys against the running API on the dev DB, plus migration state.
// Writes evidence/flows/Flow_03/runtime-proof.json and evidence/migration-state.json.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import type { PullResponse, SyncChange } from '@dialed/contracts';
import { formatHours, resolveDay, weekWorkMinutes, type ScheduleData } from '@dialed/schedule';
import { readMigrations, schemaFingerprint } from '../db/migrator';

const API = process.env.API_URL!;
const ROOT = resolve(import.meta.dirname, '../../../..');
const started = new Date().toISOString();
const steps: { step: string; ok: boolean; detail?: unknown }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) => steps.push({ step, ok, detail });

async function call<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const res = await fetch(API + path, {
    method,
    headers: {
      'x-request-id': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as T };
}

// 1. Owner signs in (Flow 01).
const login = await call<{ access_token: string; refresh_token: string }>(
  'POST',
  '/v1/auth/login',
  undefined,
  { email: 'owner@dialed.test', password: 'dialed-dev-password' },
);
check('owner login → 200 with tokens', login.status === 200 && !!login.json.access_token, {
  status: login.status,
});
const token = login.json.access_token;

// 2. First sync: since=0 snapshot, paged (Flow 03 / sync contract).
const changes: SyncChange[] = [];
let cursor: string | undefined;
let revision: number;
let pages = 0;
for (;;) {
  const r = await call<PullResponse>(
    'GET',
    `/v1/sync/pull?since=0&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    token,
  );
  pages++;
  if (r.status !== 200) throw new Error(`pull failed ${r.status}`);
  changes.push(...r.json.changes);
  revision = r.json.revision;
  if (!r.json.more) break;
  cursor = r.json.cursor;
}
check('since=0 snapshot pulls in pages', pages > 1, { pages, rows: changes.length, revision });

// 3. Resolve the seeded week from the pulled rows exactly as the device does (packages/schedule).
const rows = (e: string) =>
  changes.filter((c) => c.entity === e).map((c) => c.row as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
const data: ScheduleData = {
  categories: rows('category') as ScheduleData['categories'],
  terms: rows('term') as ScheduleData['terms'],
  routines: rows('routine') as ScheduleData['routines'],
  routineBlocks: rows('routine_block') as ScheduleData['routineBlocks'],
  overrides: rows('override') as ScheduleData['overrides'],
};
const mon = resolveDay('2026-10-19', data);
const sermon = mon.blocks.find((b) => b.title === 'Sermon Sync' && b.start_min === 760);
check(
  'resolveDay(2026-10-19) from synced rows = 11 blocks incl. Sermon Sync 12:40–14:30',
  mon.blocks.length === 11 && sermon?.end_min === 870,
  { blocks: mon.blocks.length },
);
const week = weekWorkMinutes('2026-10-19', data);
check('owner week of Oct 19 = 64.3h (64.25 h, half-up)', formatHours(week) === '64.3h', {
  minutes: week,
  display: formatHours(week),
});
const thanksgiving = resolveDay('2026-10-12', data).blocks.map(
  (b) => `${b.title} ${b.start_min}-${b.end_min}`,
);
check(
  'Thanksgiving Oct 12 = Sermon Sync 13:00–15:00 only',
  thanksgiving.length === 1 && thanksgiving[0] === 'Sermon Sync 780-900',
  thanksgiving,
);

// 4. Offline edit replay: push a profile edit twice with the same id → same receipt, one revision bump.
const prof = rows('profile')[0]!;
const m = {
  client_mutation_id: randomUUID(),
  entity: 'profile',
  op: 'upsert',
  base_version: Number(prof.version),
  fields: { theme: prof.theme === 'dark' ? 'light' : 'dark' },
};
const p1 = await call<{ revision: number; results: { status: string }[] }>(
  'POST',
  '/v1/sync/push',
  token,
  { mutations: [m] },
);
const p2 = await call<{ revision: number; results: { status: string }[] }>(
  'POST',
  '/v1/sync/push',
  token,
  { mutations: [m] },
);
check(
  'push applied once; duplicate returns the stored receipt',
  p1.json.results[0]?.status === 'applied' &&
    isDeepStrictEqual(
      p1.json.results,
      p2.json.results,
    ) /* jsonb reorders keys: compare by value */ &&
    p1.json.revision === p2.json.revision,
  { first: p1.json.results[0]?.status, revision: p1.json.revision },
);
const inc = await call<PullResponse>('GET', `/v1/sync/pull?since=${revision}`, token);
check(
  'incremental pull returns only the new change',
  inc.json.changes.length === 1 && inc.json.changes[0]?.entity === 'profile',
  { count: inc.json.changes.length },
);
// restore the owner's theme so the proof leaves no trace
await call('POST', '/v1/sync/push', token, {
  mutations: [
    {
      ...m,
      client_mutation_id: randomUUID(),
      base_version: Number(prof.version) + 1,
      fields: { theme: prof.theme },
    },
  ],
});

// 5. Session end: logout revokes the session; the old token stops working.
const out = await call('POST', '/v1/auth/logout', token);
const after = await call('GET', '/v1/sync/pull?since=0', token);
check('logout → 204, old access token → 401', out.status === 204 && after.status === 401, {
  logout: out.status,
  after: after.status,
});

// Migration state (BUILD_AGENT Gate 4 shape).
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const applied = (
  await client.query('select version, sha256, applied_at from schema_migrations order by version')
).rows;
const fingerprint = await schemaFingerprint(client);
await client.end();
const tracked = readMigrations(resolve(ROOT, 'backend/migrations')).map((f) => ({
  version: f.version,
  sha256: f.sha256,
}));
const migrationState = {
  generated_at: new Date().toISOString(),
  tracked,
  applied,
  schema_fingerprint: fingerprint,
  open_recovery_findings: [] as string[],
};
for (const t of tracked) {
  const a = applied.find((x) => x.version === t.version);
  if (!a) migrationState.open_recovery_findings.push(`${t.version} tracked but not applied`);
  else if (a.sha256 !== t.sha256)
    migrationState.open_recovery_findings.push(
      `${t.version} checksum differs from the applied one`,
    );
}

const ok = steps.every((s) => s.ok);
mkdirSync(resolve(ROOT, 'evidence/flows/Flow_03'), { recursive: true });
writeFileSync(
  resolve(ROOT, 'evidence/flows/Flow_03/runtime-proof.json'),
  JSON.stringify(
    { started_at: started, finished_at: new Date().toISOString(), api: API, ok, steps },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  resolve(ROOT, 'evidence/migration-state.json'),
  JSON.stringify(migrationState, null, 2) + '\n',
);
for (const s of steps) console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.step}`);
if (!ok) process.exitCode = 1;
