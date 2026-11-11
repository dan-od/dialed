import { describe, expect, it } from 'vitest';
import { PLAN_TOOL_SCHEMAS } from '../src/tools';

describe('PLAN_TOOL_SCHEMAS', () => {
  it('exports both propose_changes and ask_user', () => {
    const names = PLAN_TOOL_SCHEMAS.map((t) => t.name).sort();
    expect(names).toEqual(['ask_user', 'propose_changes']);
  });

  it('propose_changes has a non-empty input_schema with changes', () => {
    const propose = PLAN_TOOL_SCHEMAS.find((t) => t.name === 'propose_changes')!;
    expect(propose.description.length).toBeGreaterThan(0);
    const schema = propose.input_schema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('changes');
    expect(schema.required).toContain('changes');
  });

  it('ask_user has a non-empty input_schema with question and options', () => {
    const ask = PLAN_TOOL_SCHEMAS.find((t) => t.name === 'ask_user')!;
    expect(ask.description.length).toBeGreaterThan(0);
    const schema = ask.input_schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties).toHaveProperty('question');
    expect(schema.properties).toHaveProperty('options');
    expect(schema.required).toEqual(expect.arrayContaining(['question', 'options']));
  });
});
