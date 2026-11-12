import type { PlanMessage } from '@dialed/contracts';
import { latestQuestion } from '../plan/model';

const msg = (role: PlanMessage['role'], body: string, i: number): PlanMessage => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  role,
  body,
  created_at: `2026-11-11T10:0${i}:00.000Z`,
});

describe('latestQuestion', () => {
  it('shows the newest question after an answer, not the first', () => {
    const messages = [
      msg('question', 'Which day?', 1),
      msg('answer', 'Thursday', 2),
      msg('question', 'Morning or evening?', 3),
    ];
    expect(latestQuestion(messages)?.body).toBe('Morning or evening?');
  });

  it('is undefined when no question was asked', () => {
    expect(latestQuestion([msg('reply', 'Keep gym', 1)])).toBeUndefined();
  });
});
