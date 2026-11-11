import { describe, expect, it } from 'vitest';
import { seedData } from '../../schedule/test/seed';
import { getSchedule, listCategories, listTerms } from '../src/read-tools';

const data = seedData();

describe('shared read tools', () => {
  it('get_schedule resolves an inclusive range in the MCP shape', () => {
    const r = getSchedule(data, '2037-10-19', '2037-10-25', {
      timeZone: 'America/Toronto',
      revision: 4,
    });
    expect(r).toMatchObject({ time_zone: 'America/Toronto', revision: 4 });
    expect(r.days).toHaveLength(7);
    const block = r.days.flatMap((d) => d.blocks)[0]!;
    expect(Object.keys(block).sort()).toEqual(
      [
        'category_id',
        'end',
        'key',
        'protected',
        'quiet',
        'routine_block_id',
        'source',
        'start',
        'title',
      ].sort(),
    );
    expect(block.start).toMatch(/^\d\d:\d\d$/);
  });

  it('list_terms gives status, drafts included', () => {
    const r = listTerms(data, '2037-10-20');
    const byName = Object.fromEntries(r.terms.map((t) => [t.name, t.status]));
    expect(byName).toMatchObject({
      'Fall term': 'active',
      'Exam weeks': 'upcoming',
      'Winter term': 'draft',
    });
  });

  it('list_categories has the tools.md keys and an integer usual length', () => {
    const r = listCategories(data);
    const c = r.categories[0]!;
    expect(Object.keys(c).sort()).toEqual(
      ['color', 'group', 'id', 'name', 'protected', 'quiet', 'usual_minutes'].sort(),
    );
    expect(Number.isInteger(c.usual_minutes)).toBe(true);
  });
});
