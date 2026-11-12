import { describe, expect, it } from 'vitest';
import type { PlanChange } from '@dialed/schedule';
import { seedData } from '../../schedule/test/seed';
import { buildContext } from '../src/context';
import { runPlan, type PlanStep, type ToolContext } from '../src/loop';
import { PLAN_TOOL_SCHEMAS } from '../src/tools';
import type { PlanProvider, ProviderRunOpts } from '../src/providers/types';

// Homelab f4eb1f22 / 1d08711e: "free up tomorrow (morning)" on the same routine (Thu 11-12 in seed).
const ctx: ToolContext = {
  data: seedData(),
  today: '2037-11-11',
  source: 'in_app',
  revision: 1,
  timeZone: 'America/Toronto',
};
const context = buildContext(ctx);
const thursday = (() => {
  const lines = context.text.split('\n');
  const out: { ref: string; title: string; protected: boolean }[] = [];
  for (const line of lines.slice(lines.indexOf('Thu 11-12') + 1)) {
    if (!line.startsWith('  ')) break;
    const m = /^ {2}(b\d+) \S+ (.+?) c\d+(?: (.*))?$/.exec(line);
    if (m) out.push({ ref: m[1]!, title: m[2]!, protected: (m[3] ?? '').includes('P') });
  }
  return out;
})();
const skip = (b: { ref: string; title: string }): PlanChange => ({
  kind: 'skip',
  title: b.title,
  block_ref: b.ref,
  on_date: '2037-11-12',
  note: 'Skipped.',
});
const morningClass = thursday.find((b) => b.protected)!; // 09:40 Advanced Networking I
const gym = thursday.find((b) => b.title === 'Gym')!;

function always(changes: PlanChange[]): PlanProvider & { calls: ProviderRunOpts[] } {
  const calls: ProviderRunOpts[] = [];
  return {
    id: 'mock',
    displayName: 'Mock',
    supportsVision: false,
    calls,
    async run(opts) {
      calls.push(structuredClone(opts));
      return {
        content: '',
        tool_calls: [{ id: `p${calls.length}`, name: 'propose_changes', input: { changes } }],
        tokens_in: 1,
        tokens_out: 1,
      };
    },
  };
}

const plan = (
  provider: PlanProvider,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  onStep?: (s: PlanStep) => void,
) =>
  runPlan({
    provider,
    guide: 'g',
    request: 'Free up tomorrow morning',
    history,
    toolSchemas: PLAN_TOOL_SCHEMAS,
    ctx,
    context,
    onStep,
    temperature: 0,
  });

describe('validation rounds are reported', () => {
  it('every failed round reaches onStep with its errors', async () => {
    const steps: PlanStep[] = [];
    await plan(always([skip(morningClass)]), [], (s) => steps.push(s));
    const rounds = steps.filter((s) => s.kind === 'validate_error');
    expect(rounds).toHaveLength(3);
    expect(rounds[0]!.errors![0]).toMatchObject({ code: 'protected_block', change_index: 0 });
  });

  it('a failed run carries the last round’s errors', async () => {
    const r = await plan(always([skip(morningClass)]));
    expect(r.status).toBe('failed');
    if (r.status === 'failed') {
      expect(r.code).toBe('validation_failed');
      expect(r.validationErrors![0]).toMatchObject({
        code: 'protected_block',
        subject: '9:40 Advanced Networking I',
      });
    }
  });
});

describe('when rounds run out, keep what is valid', () => {
  it('returns a ready plan with the valid changes and a note naming what was left out and why', async () => {
    const r = await plan(always([skip(gym), skip(morningClass)]));
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.changes).toHaveLength(1);
    expect((r.changes[0] as { title: string }).title).toBe('Gym');
    const note = r.checks.find((c) => c.id === 'left_out')!;
    expect(note.passed).toBe(false);
    expect(note.detail).toContain('Advanced Networking I');
    expect(note.detail).toMatch(/protected class/i);
    expect(note.detail.length).toBeLessThanOrEqual(200);
  });

  it('fails only when no change is valid', async () => {
    expect((await plan(always([skip(morningClass)]))).status).toBe('failed');
  });
});

describe('protected classes are spelled out to the model', () => {
  it('says up front that no class is named yet', async () => {
    const p = always([skip(gym)]);
    await plan(p, [
      { role: 'assistant', content: 'Which blocks?' },
      { role: 'user', content: 'everything before 12' },
    ]);
    const first = p.calls[0]!.messages[0]!.content;
    expect(first).toMatch(/PROTECTED NOW: no class named/);
  });

  it('says classes may change once the Planner said "classes"', async () => {
    const p = always([skip(gym)]);
    await plan(p, [
      { role: 'assistant', content: 'Which blocks?' },
      { role: 'user', content: 'everything before 12, classes too' },
    ]);
    expect(p.calls[0]!.messages[0]!.content).toMatch(/PROTECTED NOW: the Planner named classes/);
  });

  it('the protected_block error tells the model to drop it or ask', async () => {
    const p = always([skip(morningClass)]);
    await plan(p);
    const fed = JSON.stringify(p.calls[1]!.messages.at(-1)!.tool_results![0]!.output);
    expect(fed).toMatch(/ask_user/);
    expect(fed).toMatch(/hasn.t named/);
  });

  it('passes the planning temperature to the provider', async () => {
    const p = always([skip(gym)]);
    await plan(p);
    expect(p.calls[0]!.temperature).toBe(0);
  });
});
