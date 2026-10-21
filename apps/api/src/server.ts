import { loadConfig } from './config';
import { buildApp } from './app';
import { createDb } from './db/pool';
import { ConsoleTransport } from './email';

const config = loadConfig();
const { pool, db } = createDb(config.DATABASE_URL);
const app = await buildApp(config, { pool, db, email: new ConsoleTransport() });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
