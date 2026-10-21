import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// DATE columns stay ISO strings (YYYY-MM-DD); never shift them through JS Date/time zones.
pg.types.setTypeParser(1082, (v) => v);
// bigint revisions fit in JS numbers for any realistic per-user count.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric (category weight) → number
pg.types.setTypeParser(1700, (v) => Number(v));

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
