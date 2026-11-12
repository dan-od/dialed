import { describe, expect, it } from 'vitest';
import type { PlanChange } from '@dialed/schedule';
import { seedData } from '../../schedule/test/seed';
import { buildContext } from '../src/context';
import { runPlan, type ToolContext } from '../src/loop';
import { PLAN_TOOL_SCHEMAS } from '../src/tools';
import { validate } from '../src/validate';
import type { PlanProvider, ProviderRunOpts } from '../src/providers/types';

// Homelab plan 99c92257: "Free up tomorrow" → Claude asks → "Skip everything, including classes".
const ctx: ToolContext = {
  data: seedData(),
  today: '2037-11-11',
  source: 'in_app',
  revision: 1,
  timeZone: 'America/Toronto',
};
const context = buildContext(ctx);
const QUESTION =
  'Tomorrow (Thu Nov 12) has 3 classes that are protected and can’t be skipped unless you name them. Meals stay too. Which of the other blocks should I skip?';

function skipAllThursday(): PlanChange[] {
  const lines = context.text.split('\n');
  const out: PlanChange[] = [];
  for (const line of lines.slice(lines.indexOf('Thu 11-12') + 1)) {
    if (!line.startsWith('  ')) break;
    const m = /^ {2}(b\d+) \S+ (.+?) c\d+/.exec(line);
    if (m)
      out.push({
        kind: 'skip',
        title: m[2]!,
        block_ref: m[1]!,
        on_date: '2037-11-12',
        note: 'Skipped.',
      });
  }
  return out;
}

/** Answers each call with the next input in `turns`, recording what it was sent. */
function scripted(turns: Record<string, unknown>[]): PlanProvider & { calls: ProviderRunOpts[] } {
  const calls: ProviderRunOpts[] = [];
  return {
    id: 'mock',
    displayName: 'Mock',
    supportsVision: false,
    calls,
    async run(opts) {
      calls.push(structuredClone(opts));
      const input = turns[Math.min(calls.length - 1, turns.length - 1)]!;
      return {
        content: '',
        tool_calls: [{ id: `p${calls.length}`, name: 'propose_changes', input }],
        tokens_in: 1,
        tokens_out: 1,
      };
    },
  };
}

const run = (provider: PlanProvider, answer: string) =>
  runPlan({
    provider,
    guide: 'g',
    request: 'Free up tomorrow',
    history: [
      { role: 'assistant', content: QUESTION },
      { role: 'user', content: answer },
    ],
    toolSchemas: PLAN_TOOL_SCHEMAS,
    ctx,
    context,
  });

describe('after the Planner answers (homelab 99c92257)', () => {
  it('"Skip everything, including classes" lets the protected classes be skipped', async () => {
    const changes = skipAllThursday();
    expect(changes.length).toBe(10);
    const r = await run(
      scripted([{ request_text: 'Free up tomorrow', changes }]),
      'Skip everything, including classes',
    );
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(r.changes).toHaveLength(10);
  });

  it('without naming classes, protected blocks come back as a validation error for the model', async () => {
    const provider = scripted([{ request_text: 'Free up tomorrow', changes: skipAllThursday() }]);
    const r = await run(provider, 'Skip the rest');
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.code).toBe('validation_failed');
    const fed = provider.calls[1]!.messages.at(-1)!.tool_results![0]!;
    expect(fed.is_error).toBe(true);
    expect(JSON.stringify(fed.output)).toContain('protected_block');
  });

  it("the model can't unlock classes by writing it into request_text itself", async () => {
    const r = await run(
      scripted([
        { request_text: 'Skip everything, including classes', changes: skipAllThursday() },
      ]),
      'Skip the rest',
    );
    expect(r.status).toBe('failed');
  });
});

describe('malformed proposals never throw', () => {
  const skip = { kind: 'skip', title: 'Gym', block_ref: 'b16', on_date: '2037-11-12', note: 'x' };
  const bad: Record<string, unknown> = {
    'changes missing': { request_text: 'r' },
    'skip without on_date': { request_text: 'r', changes: [{ ...skip, on_date: undefined }] },
    'unknown field': {
      request_text: 'r',
      changes: [{ ...skip, on_date: undefined, date: '2037-11-12' }],
    },
    'changed without fields': {
      request_text: 'r',
      changes: [
        { kind: 'changed', title: 'Gym', block_ref: 'b16', on_date: '2037-11-12', note: 'x' },
      ],
    },
    'removed without from': {
      request_text: 'r',
      changes: [{ kind: 'removed', title: 'Gym', block_ref: 'b16', note: 'x' }],
    },
    'unknown kind': {
      request_text: 'r',
      changes: [{ kind: 'delete', title: 'Gym', block_ref: 'b16', note: 'x' }],
    },
    'bad date': { request_text: 'r', changes: [{ ...skip, on_date: 'tomorrow' }] },
  };

  for (const [name, input] of Object.entries(bad)) {
    it(`${name}: the model gets a readable error and can fix it`, async () => {
      const provider = scripted([
        input as Record<string, unknown>,
        { request_text: 'r', changes: [skip] },
      ]);
      const r = await run(provider, 'Just the gym');
      expect(r.status).toBe('ready');
      const fed = provider.calls[1]!.messages.at(-1)!.tool_results![0]!;
      expect(fed.is_error).toBe(true);
      expect(JSON.stringify(fed.output)).toContain('bad_change');
    });
  }

  it('changes sent as a JSON string are read', async () => {
    const r = await run(
      scripted([{ request_text: 'r', changes: JSON.stringify([skip]) }]),
      'Just the gym',
    );
    expect(r.status).toBe('ready');
  });

  it('validate() itself returns errors instead of throwing', () => {
    const r = validate(
      {
        request_text: 'r',
        changes: [
          { kind: 'skip', title: 'Gym', block_ref: 'b16', note: 'x' } as unknown as PlanChange,
        ],
      },
      { ...ctx, refs: context.refs },
    );
    expect(r.errors[0]!.code).toBe('bad_change');
  });
});

describe('provider errors', () => {
  it('a refused key is provider_key_invalid with the HTTP status for the logs', async () => {
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run() {
        throw Object.assign(new Error('provider_key_invalid'), { status: 401 });
      },
    };
    const r = await run(provider, 'Just the gym');
    expect(r.status).toBe('failed');
    if (r.status === 'failed') {
      expect(r.code).toBe('provider_key_invalid');
      expect(r.detail?.status).toBe(401);
    }
  });
});
