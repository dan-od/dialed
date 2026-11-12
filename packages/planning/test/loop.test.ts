import type { PlanChange } from '@dialed/contracts';
import { describe, expect, it } from 'vitest';
import { seedData } from '../../schedule/test/seed';
import { buildContext } from '../src/context';
import { runPlan, type ToolContext } from '../src/loop';
import { PLAN_TOOL_SCHEMAS } from '../src/tools';
import { READ_TOOL_SCHEMAS } from '../src/read-tools';
import type { PlanProvider, ProviderRunOpts } from '../src/providers/types';

const TODAY = '2037-10-20';
const data = seedData();
const ctx: ToolContext = {
  data,
  today: TODAY,
  source: 'in_app',
  revision: 9,
  timeZone: 'America/Toronto',
};

/** Plays a model that reads tomorrow's unprotected blocks from the context and skips them, in one turn. */
function freeUpTomorrowModel(): PlanProvider & { calls: ProviderRunOpts[] } {
  const calls: ProviderRunOpts[] = [];
  return {
    id: 'mock',
    displayName: 'Mock',
    supportsVision: false,
    calls,
    async run(opts) {
      calls.push(opts);
      const first = opts.messages[0]!.content;
      const lines = first.split('\n');
      const start = lines.indexOf('Wed 10-21');
      const changes: PlanChange[] = [];
      for (const line of lines.slice(start + 1)) {
        if (!line.startsWith('  ')) break;
        const m = /^ {2}(b\d+) \S+ (.+?) c\d+(?: (.*))?$/.exec(line);
        if (!m || (m[3] ?? '').includes('P')) continue;
        changes.push({
          kind: 'skip',
          title: m[2]!,
          block_ref: m[1]!,
          on_date: '2037-10-21',
          note: 'Freed.',
        });
      }
      return {
        content: '',
        tool_calls: [
          {
            id: 't1',
            name: 'propose_changes',
            input: { request_text: 'Free up tomorrow', changes },
          },
        ],
        tokens_in: 100,
        tokens_out: 50,
      };
    },
  };
}

describe('runPlan with a preloaded context', () => {
  it('"free up tomorrow" finishes in one model turn and stores real ids', async () => {
    const context = buildContext(ctx);
    const provider = freeUpTomorrowModel();
    const result = await runPlan({
      provider,
      guide: 'Static guide.',
      request: 'Free up tomorrow',
      history: [],
      toolSchemas: [...PLAN_TOOL_SCHEMAS, ...READ_TOOL_SCHEMAS],
      ctx,
      context,
    });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.system).toBe('Static guide.');
    expect(provider.calls[0]!.messages[0]!.content).toContain('DIALED CONTEXT rev 9');
    expect(provider.calls[0]!.messages[0]!.content).toContain('Free up tomorrow');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.changes.length).toBeGreaterThan(0);
    const ids = new Set(data.routineBlocks.map((b) => b.id));
    for (const c of result.changes) {
      const ref = (c as { block_ref: string }).block_ref;
      expect(ref).not.toMatch(/^b\d+$/);
      expect(ids.has(ref)).toBe(true);
    }
  });

  it('after one Q&A the provider gets [user(context+request), assistant(question), user(answer)]', async () => {
    const context = buildContext(ctx);
    const provider = freeUpTomorrowModel();
    await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: [
        { role: 'assistant', content: 'All blocks, or just the afternoon?' },
        { role: 'user', content: 'All of them' },
      ],
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
      context,
    });
    const msgs = provider.calls[0]!.messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[0]!.content.startsWith('DIALED CONTEXT')).toBe(true);
    expect(msgs[0]!.content.endsWith('Free up tomorrow')).toBe(true);
    expect(msgs[1]!.content).toBe('All blocks, or just the afternoon?');
    expect(msgs[2]!.content).toBe('All of them');
  });

  it('a reply after a ready plan never sends two user messages in a row', async () => {
    const provider = freeUpTomorrowModel();
    await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: [{ role: 'user', content: 'Keep the gym though' }],
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
      context: buildContext(ctx),
    });
    const msgs = provider.calls[0]!.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.content).toContain('Free up tomorrow');
    expect(msgs[0]!.content.endsWith('Keep the gym though')).toBe(true);
  });

  it('answers get_schedule for dates outside the window, refuses dates inside it', async () => {
    const context = buildContext(ctx);
    let turn = 0;
    const seen: unknown[] = [];
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run(opts) {
        turn++;
        const last = opts.messages.at(-1)!;
        if (last.tool_results) seen.push(...last.tool_results);
        if (turn === 1)
          return {
            content: '',
            tool_calls: [
              { id: 'a', name: 'get_schedule', input: { from: '2037-12-01', to: '2037-12-02' } },
              { id: 'b', name: 'get_schedule', input: { from: '2037-10-21', to: '2037-10-22' } },
            ],
            tokens_in: 1,
            tokens_out: 1,
          };
        return { content: 'Nothing to change.', tool_calls: [], tokens_in: 1, tokens_out: 1 };
      },
    };
    const r = await runPlan({
      provider,
      guide: 'g',
      request: 'What about December?',
      history: [],
      toolSchemas: [...PLAN_TOOL_SCHEMAS, ...READ_TOOL_SCHEMAS],
      ctx,
      context,
    });
    expect(r.status).toBe('nothing');
    const [outside, inside] = seen as {
      id: string;
      is_error?: boolean;
      output: { days?: unknown[] };
    }[];
    expect(outside!.id).toBe('a');
    expect(outside!.is_error).toBeFalsy();
    expect(outside!.output.days).toHaveLength(2);
    expect(inside!.id).toBe('b');
    expect(inside!.is_error).toBe(true);
  });
});

describe('question cap', () => {
  const twoAsked = [
    { role: 'assistant' as const, content: 'Which day?' },
    { role: 'user' as const, content: 'Thursday' },
    { role: 'assistant' as const, content: 'Morning or evening?' },
    { role: 'user' as const, content: 'Either' },
  ];

  it('after 2 questions, ask_user is withdrawn and the model is told to propose', async () => {
    const provider = freeUpTomorrowModel();
    const r = await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: twoAsked,
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
      context: buildContext(ctx),
    });
    const sent = provider.calls[0]!;
    expect(sent.tools.map((t) => t.name)).not.toContain('ask_user');
    expect(sent.messages.at(-1)!.content).toMatch(/propose your best plan/i);
    expect(r.status).toBe('ready');
  });

  it('a third question fails with too_many_questions', async () => {
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run() {
        return {
          content: '',
          tool_calls: [
            { id: 'q', name: 'ask_user', input: { question: 'Really?', options: ['Yes'] } },
          ],
          tokens_in: 1,
          tokens_out: 1,
        };
      },
    };
    const r = await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: twoAsked,
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
      context: buildContext(ctx),
    });
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.code).toBe('too_many_questions');
  });

  it('one question so far still allows a second', async () => {
    const provider = freeUpTomorrowModel();
    await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: twoAsked.slice(0, 2),
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
    });
    expect(provider.calls[0]!.tools.map((t) => t.name)).toContain('ask_user');
  });
});

describe('provider call limits', () => {
  it('gives each call 60 s and reports a real timeout as timeout, not provider_error', async () => {
    const calls: ProviderRunOpts[] = [];
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run(opts) {
        calls.push(opts);
        throw new Error('request timed out');
      },
    };
    const result = await runPlan({
      provider,
      guide: 'g',
      request: 'Free up tomorrow',
      history: [],
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
    });
    expect(calls[0]!.timeoutMs).toBe(60_000);
    expect(result).toMatchObject({ status: 'failed', code: 'timeout' });
  });

  it('a 400 from the provider stays provider_error', async () => {
    const provider: PlanProvider = {
      id: 'mock',
      displayName: 'Mock',
      supportsVision: false,
      async run() {
        throw Object.assign(new Error('provider_error'), { status: 400, body: 'bad' });
      },
    };
    const result = await runPlan({
      provider,
      guide: 'g',
      request: 'x',
      history: [],
      toolSchemas: PLAN_TOOL_SCHEMAS,
      ctx,
    });
    expect(result).toMatchObject({ status: 'failed', code: 'provider_error' });
  });
});
