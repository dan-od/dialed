import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    migrate: 'src/cli/migrate.ts',
    invite: 'src/invite.ts',
    'test-owner': 'src/test-owner.ts',
    'plan-compare': 'src/cli/plan_compare.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  // Workspace packages are TS source: bundle them; keep native/runtime deps external.
  noExternal: [/^@dialed\//],
  external: [
    '@node-rs/argon2',
    'pg',
    'fastify',
    '@fastify/rate-limit',
    'jose',
    'drizzle-orm',
    'zod',
  ],
});
