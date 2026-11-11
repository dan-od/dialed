import type { PlanChange } from '@dialed/schedule';
import { describe, expect, it } from 'vitest';
import { seedData } from '../../schedule/test/seed';
import { buildContext } from '../src/context';
import { validate } from '../src/validate';
import type { ToolContext } from '../src/loop';

const TODAY = '2037-10-20';
const data = seedData();
const tctx: ToolContext = {
  data,
  today: TODAY,
  source: 'in_app',
  revision: 3,
  timeZone: 'America/Toronto',
};
const context = buildContext(tctx);

/** First unprotected block ref on a date, read back out of the context text. */
function refOn(dayLabel: string): { ref: string; title: string } {
  const lines = context.text.split('\n');
  const start = lines.indexOf(dayLabel);
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    const m = /^ {2}(b\d+) \S+ (.+?) c\d+(?: (.*))?$/.exec(line);
    if (m && !(m[3] ?? '').includes('P')) return { ref: m[1]!, title: m[2]! };
  }
  throw new Error(`no unprotected block on ${dayLabel}`);
}

describe('refs in the validator', () => {
  it('maps a short block ref back to the real routine block id', () => {
    const { ref, title } = refOn('Wed 10-21');
    const change: PlanChange = {
      kind: 'skip',
      title,
      block_ref: ref,
      on_date: '2037-10-21',
      note: 'Free.',
    };
    const r = validate(
      { request_text: 'free up tomorrow', changes: [change] },
      { ...tctx, refs: context.refs },
    );
    expect(r.errors).toEqual([]);
    const mapped = r.changes[0] as Extract<PlanChange, { kind: 'skip' }>;
    expect(mapped.block_ref).toBe(context.refs.blocks[ref]);
    expect(data.routineBlocks.find((b) => b.id === mapped.block_ref)!.title).toBe(title);
  });

  it('maps category refs and lets a real id through', () => {
    const [cref, cid] = Object.entries(context.refs.categories).find(([, id]) => {
      const c = data.categories.find((x) => x.id === id)!;
      return !c.quiet && !c.protected;
    })!;
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'Walk',
        category_id: cref,
        on_date: '2037-10-24',
        start: '06:00',
        end: '06:30',
        note: 'A.',
      },
      {
        kind: 'new',
        title: 'Read',
        category_id: cid,
        on_date: '2037-10-25',
        start: '06:00',
        end: '06:30',
        note: 'B.',
      },
    ];
    const r = validate({ request_text: 'add a walk', changes }, { ...tctx, refs: context.refs });
    expect(r.errors).toEqual([]);
    expect(r.changes.map((c) => (c as { category_id: string }).category_id)).toEqual([cid, cid]);
  });

  it('rejects an unknown ref', () => {
    const change: PlanChange = {
      kind: 'skip',
      title: 'Ghost',
      block_ref: 'b999',
      on_date: '2037-10-21',
      note: 'x',
    };
    const r = validate(
      { request_text: 'skip it', changes: [change] },
      { ...tctx, refs: context.refs },
    );
    expect(r.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'unknown_ref' }),
    );
  });

  it('a temp id from create_category wins over a category ref with the same name', () => {
    const changes: PlanChange[] = [
      {
        kind: 'create_category',
        title: 'Bible study',
        new_category: { temp_id: 'c1', name: 'Bible study', group: 'Life', palette: 'Mint' },
        note: 'New.',
      },
      {
        kind: 'new',
        title: 'Study',
        category_id: 'c1',
        on_date: '2037-10-24',
        start: '06:00',
        end: '06:30',
        note: 'A.',
      },
    ];
    const r = validate({ request_text: 'bible study', changes }, { ...tctx, refs: context.refs });
    expect(r.errors).toEqual([]);
    expect((r.changes[1] as { category_id: string }).category_id).toBe('c1');
  });
});
