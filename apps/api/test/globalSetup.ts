import { resolve } from 'node:path';
import pg from 'pg';
import { migrate } from '../src/db/migrator';
import { seed } from '../src/db/seeder';

const ROOT = resolve(import.meta.dirname, '../../..');

export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? 'postgres://dialed:dialed@127.0.0.1:55432/dialed';
  const u = new URL(base);
  u.pathname = '/dialed_test';
  return u.toString();
}

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const a = new pg.Client({ connectionString: admin.toString() });
  await a.connect();
  await a.query('DROP DATABASE IF EXISTS dialed_test WITH (FORCE)');
  await a.query('CREATE DATABASE dialed_test');
  await a.end();
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  await migrate(c, resolve(ROOT, 'backend/migrations'));
  await seed(c, resolve(ROOT, 'backend/seed/0001_seed.sql'), 'test');
  await c.end();
  process.env.TEST_DATABASE_URL = url.toString();
}
