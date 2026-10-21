import { sql } from 'drizzle-orm';
import type { SyncEntity } from '@dialed/contracts';
import type { Tx } from '../db/pool';
import { syncRow } from './rows';

/**
 * The one write path for schedule data (BACKEND_SETUP §4): bumps the per-user revision once per transaction
 * and appends change_log rows in the same transaction. The UPDATE … RETURNING row lock serialises a user's
 * writers, so revisions commit in order and a pull can never skip a lower revision committed later.
 */
export class ChangeRecorder {
  private revision: number | null = null;
  constructor(
    private readonly tx: Tx,
    private readonly userId: string,
  ) {}

  async currentRevision(): Promise<number> {
    if (this.revision !== null) return this.revision;
    const r = await this.tx.execute<{ revision: number }>(sql`
      INSERT INTO revisions(user_id, revision, updated_at) VALUES (${this.userId}, 1, now())
      ON CONFLICT (user_id) DO UPDATE SET revision = revisions.revision + 1, updated_at = now()
      RETURNING revision`);
    this.revision = Number(r.rows[0]!.revision);
    return this.revision;
  }

  async record(
    entity: SyncEntity,
    entityId: string,
    op: 'upsert' | 'delete',
    row: Record<string, unknown> | null,
  ) {
    const revision = await this.currentRevision();
    const json = row ? JSON.stringify(syncRow(entity, row)) : null;
    await this.tx.execute(sql`
      INSERT INTO change_log(user_id, revision, entity, entity_id, op, row_json)
      VALUES (${this.userId}, ${revision}, ${entity}, ${entityId}, ${op}, ${json}::jsonb)`);
    return revision;
  }
}
