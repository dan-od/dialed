import { describe, expect, it } from 'vitest';
import { seedData } from '../../schedule/test/seed';
import { buildContext, estimateTokens } from '../src/context';
import type { ToolContext } from '../src/loop';

const TODAY = '2037-10-20';

function ctx(): ToolContext {
  return {
    data: seedData(),
    today: TODAY,
    source: 'in_app',
    revision: 7,
    timeZone: 'America/Toronto',
    profile: { day_start_min: 420, day_end_min: 1380, quiet_start_min: 1320, quiet_end_min: 420 },
  };
}

describe('buildContext', () => {
  it('renders a plain-text header, categories, term and one line per block', () => {
    const c = buildContext(ctx());
    expect(c.text).toMatch(/^DIALED CONTEXT rev 7 · today Tue 2037-10-20 · America\/Toronto/);
    expect(c.text).toContain('window 2037-10-20..2037-11-03');
    expect(c.text).toContain('LIMITS day 07:00-23:00 · quiet 22:00-07:00');
    expect(c.text).toMatch(/\nTERM t1 .+ active\n/);
    expect(c.text).toMatch(/\nc1 .+\(.+\)/);
    expect(c.text).toMatch(/\nWed 10-21\n {2}b\d+ \d\d:\d\d-\d\d:\d\d .+ c\d+/);
    expect(c.text.trim().startsWith('{')).toBe(false);
  });

  it('maps every block ref to a real routine block id, and refs are stable for a revision', () => {
    const a = buildContext(ctx());
    const b = buildContext(ctx());
    expect(a.text).toBe(b.text);
    const ids = new Set(seedData().routineBlocks.map((r) => r.id));
    const refs = Object.entries(a.refs.blocks);
    expect(refs.length).toBeGreaterThan(0);
    for (const [ref, id] of refs) {
      expect(ref).toMatch(/^b\d+$/);
      expect(ids.has(id)).toBe(true);
    }
    const catIds = new Set(seedData().categories.map((c) => c.id));
    for (const id of Object.values(a.refs.categories)) expect(catIds.has(id)).toBe(true);
  });

  it('keeps a typical week under ~2k tokens', () => {
    const week = buildContext(ctx(), 7);
    expect(week.tokens).toBe(estimateTokens(week.text));
    expect(week.tokens).toBeLessThan(2000);
  });
});
