import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AnswerPlanBody,
  ApprovePlanBody,
  CreatePlanBody,
  ERROR_CODES,
  MCP_TOOLS,
  PlanChange,
  ProposeChangesInput,
  mcpToolJsonSchema,
} from '../src';

function fixture(name: string) {
  const path = fileURLToPath(
    new URL(`../../../backend/seed/fixtures/plans/${name}`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('PlanChange', () => {
  it('parses every change in the bible-study fixture', () => {
    const { changes } = fixture('bible-study.json').propose_changes;
    for (const c of changes) {
      const r = PlanChange.safeParse(c);
      expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
    }
  });

  it('rejects a "new" change with neither repeat nor on_date', () => {
    const base = {
      kind: 'new',
      title: 'X',
      category_id: 'c1',
      start: '19:00',
      end: '20:30',
      note: 'n',
    };
    expect(PlanChange.safeParse(base).success).toBe(false);
    expect(
      PlanChange.safeParse({
        ...base,
        repeat: { weekday: 'wed', from: '2026-10-21', until: '2026-12-31' },
      }).success,
    ).toBe(true);
    expect(PlanChange.safeParse({ ...base, on_date: '2026-10-21' }).success).toBe(true);
    expect(
      PlanChange.safeParse({
        ...base,
        on_date: '2026-10-21',
        repeat: { weekday: 'wed', from: '2026-10-21', until: '2026-12-31' },
      }).success,
    ).toBe(false);
  });

  it('rejects a repeating move without to_weekday', () => {
    const r = PlanChange.safeParse({
      kind: 'moved',
      title: 'X',
      block_ref: 'blk1',
      repeat: { weekday: 'sun', from: '2026-10-25', until: '2026-12-11' },
      start: '15:00',
      end: '16:45',
      note: 'n',
    });
    expect(r.success).toBe(false);
  });

  it('rejects times off the 5-minute grid', () => {
    expect(
      PlanChange.safeParse({
        kind: 'skip',
        title: 'X',
        block_ref: 'blk1',
        on_date: '2026-10-21',
        note: 'n',
      }).success,
    ).toBe(true);
    const bad = {
      kind: 'new',
      title: 'X',
      category_id: 'c1',
      on_date: '2026-10-21',
      start: '19:07',
      end: '20:30',
      note: 'n',
    };
    expect(PlanChange.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown field (strict object)', () => {
    expect(
      PlanChange.safeParse({
        kind: 'skip',
        title: 'X',
        block_ref: 'blk1',
        on_date: '2026-10-21',
        note: 'n',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('ProposeChangesInput', () => {
  it('round-trips the bible-study fixture', () => {
    const input = fixture('bible-study.json').propose_changes;
    const r = ProposeChangesInput.safeParse(input);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
    expect(r.success && r.data.changes).toHaveLength(4);
  });
});

describe('request bodies', () => {
  it('CreatePlanBody requires an in_app source and 1–4000 chars', () => {
    expect(
      CreatePlanBody.safeParse({ source: 'in_app', request_text: 'x', provider_mode: 'server' })
        .success,
    ).toBe(true);
    expect(
      CreatePlanBody.safeParse({ source: 'mcp', request_text: 'x', provider_mode: 'server' })
        .success,
    ).toBe(false);
    expect(
      CreatePlanBody.safeParse({ source: 'in_app', request_text: '', provider_mode: 'server' })
        .success,
    ).toBe(false);
    expect(
      CreatePlanBody.safeParse({
        source: 'in_app',
        request_text: 'x'.repeat(4001),
        provider_mode: 'server',
      }).success,
    ).toBe(false);
  });

  it('AnswerPlanBody takes exactly one of option or text', () => {
    expect(AnswerPlanBody.safeParse({ option: 'A' }).success).toBe(true);
    expect(AnswerPlanBody.safeParse({ text: 'make it 7:30' }).success).toBe(true);
    expect(AnswerPlanBody.safeParse({}).success).toBe(false);
    expect(AnswerPlanBody.safeParse({ option: 'A', text: 'B' }).success).toBe(false);
  });

  it('ApprovePlanBody requires a plan_version', () => {
    expect(ApprovePlanBody.safeParse({ plan_version: 1 }).success).toBe(true);
    expect(ApprovePlanBody.safeParse({}).success).toBe(false);
    expect(ApprovePlanBody.safeParse({ plan_version: 0 }).success).toBe(false);
  });
});

describe('plan error codes', () => {
  const PLAN_CODES = [
    'plan_stale',
    'plan_changed',
    'plan_invalid',
    'plan_not_ready',
    'validation_failed',
    'provider_error',
    'provider_key_invalid',
    'daily_limit',
  ] as const;
  it.each(PLAN_CODES)('%s is a known error code', (code) => {
    expect(ERROR_CODES).toContain(code);
  });
});

describe('MCP tools', () => {
  it('propose_changes shares the ProposeChangesInput/Output schemas', () => {
    expect(MCP_TOOLS.propose_changes.input).toBe(ProposeChangesInput);
  });

  it('every tool converts to JSON Schema', () => {
    for (const name of Object.keys(MCP_TOOLS) as (keyof typeof MCP_TOOLS)[]) {
      const { input, output } = mcpToolJsonSchema(name);
      expect(input.type).toBe('object');
      expect(output).toBeTruthy();
    }
  });

  it('get_schedule input requires from and to', () => {
    expect(
      MCP_TOOLS.get_schedule.input.safeParse({ from: '2026-10-19', to: '2026-10-25' }).success,
    ).toBe(true);
    expect(MCP_TOOLS.get_schedule.input.safeParse({ from: '2026-10-19' }).success).toBe(false);
  });
});
