import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanChange, PlanCheck } from '@dialed/contracts';
import type { PlanProvider, ToolCall } from './types';

interface Fixture {
  request_text?: string;
  propose_changes?: { request_text: string; changes: PlanChange[]; checks: PlanCheck[] };
  ask_user?: { question: string; options: string[] };
  after_answer?: string;
  behaviour?: string;
}

let fixtureDir = '';
const fixtures = new Map<string, Fixture>();

export function loadFixtures(dir: string) {
  fixtureDir = dir;
  fixtures.clear();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture;
    fixtures.set(f.replace('.json', ''), data);
  }
}

function findFixture(requestText: string): { name: string; fixture: Fixture } | null {
  for (const [name, fixture] of fixtures) {
    if (fixture.request_text && requestText.includes(fixture.request_text.slice(0, 30))) {
      return { name, fixture };
    }
  }
  return null;
}

export function createFixtureProvider(requestText: string): PlanProvider & { _step: number } {
  const match = findFixture(requestText);
  const fixture = match?.fixture ?? {};
  let step = 0;

  return {
    id: 'fixture',
    displayName: 'Fixture',
    supportsVision: false,
    _step: 0,
    async run({ messages }) {
      step++;
      (this as { _step: number })._step = step;

      if (fixture.behaviour?.includes('throw provider_error')) {
        throw new Error('provider_error');
      }

      if (fixture.behaviour?.includes('overlapping')) {
        const protectedBlockId = 'd88c4434-6cc3-503b-a898-ea648ce5a45c';
        return {
          content: '',
          tool_calls: [
            {
              name: 'propose_changes',
              input: {
                request_text: requestText,
                changes: [
                  {
                    kind: 'new',
                    title: 'Conflict block',
                    category_id: '82972f34-0c7e-5bbf-986d-3373a76f187f',
                    on_date: '2026-10-22',
                    start: '09:40',
                    end: '11:00',
                    note: 'Overlaps with protected class.',
                  },
                ],
                checks: [],
              },
            },
          ] as ToolCall[],
          tokens_in: 100,
          tokens_out: 50,
        };
      }

      const hasHistory = messages.length > 1;
      if (fixture.ask_user && step === 1 && !hasHistory) {
        return {
          content: '',
          tool_calls: [
            {
              name: 'ask_user',
              input: { question: fixture.ask_user.question, options: fixture.ask_user.options },
            },
          ],
          tokens_in: 100,
          tokens_out: 50,
        };
      }

      let source = fixture;
      if (fixture.after_answer && (step > 1 || hasHistory)) {
        const afterName = fixture.after_answer.replace('.json', '');
        source = fixtures.get(afterName) ?? fixture;
      }

      if (source.propose_changes) {
        return {
          content: '',
          tool_calls: [
            {
              name: 'propose_changes',
              input: source.propose_changes,
            },
          ],
          tokens_in: 200,
          tokens_out: 100,
        };
      }

      return { content: 'Nothing to change.', tool_calls: [], tokens_in: 50, tokens_out: 20 };
    },
  };
}
