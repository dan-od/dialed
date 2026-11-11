import { buildContext, type PlanningContext, type ToolContext } from '@dialed/planning';

const MAX_ENTRIES = 200;
const cache = new Map<string, PlanningContext>();

/**
 * The planning context for a user, rebuilt when the schedule revision changes (D-123). The key also
 * carries the day and the profile limits, which move the window or the LIMITS line without a revision.
 * In-process per API/worker instance; Map insertion order makes it a small LRU.
 */
export function contextFor(userId: string, ctx: ToolContext): PlanningContext {
  const p = ctx.profile;
  const key = [
    userId,
    ctx.revision,
    ctx.today,
    ctx.timeZone,
    p ? `${p.day_start_min}-${p.day_end_min}-${p.quiet_start_min}-${p.quiet_end_min}` : '',
  ].join(':');
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const built = buildContext(ctx);
  cache.set(key, built);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return built;
}
