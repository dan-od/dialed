import type { ErrorCode, PlanDTO } from '@dialed/contracts';
import { aiName } from '../config';

const SENTENCES: Record<string, (ai: string) => string> = {
  provider_error: (ai) => `${ai} didn’t answer within 30 seconds.`,
  provider_key_invalid: (ai) => `Your ${providerLabel(ai)} key was refused. Check it in Settings.`,
  daily_limit: (_ai) =>
    `You’ve used today’s 30 plans on the Dialed server. Try again tomorrow or bring your own key.`,
  validation_failed: (ai) => `${ai} couldn’t make a plan that fits your limits. Try rewording it.`,
  too_many_questions: (ai) =>
    `${ai} still wasn’t sure after two questions. Try again with the day, time and how long.`,
};

export function errorSentence(code: ErrorCode | string | null): string {
  const ai = aiName();
  const fn = SENTENCES[code ?? ''];
  return fn ? fn(ai) : `${ai} ran into a problem. Try again.`;
}

export function exhaustedSentence(): string {
  const ai = aiName();
  return `Still can’t reach ${ai}. Your request is saved.`;
}

export function staleSentence(detail?: string): string {
  return detail ?? 'Your schedule changed since this plan was drafted. Redo it so nothing clashes.';
}

export function draftingSub(): string {
  return `You can leave this screen. You’ll get a notification when it’s ready.`;
}

export function composerPlaceholder(): string {
  return 'What should change?';
}

export function composerSub(): string {
  const ai = aiName();
  return `Type it, or tap the mic on your keyboard and say it. ${ai} drafts the changes and nothing moves until you approve it.`;
}

export function emptyError(): string {
  const ai = aiName();
  return `Tell ${ai} what to change first. For example: "Gym on Sunday mornings for the rest of the year".`;
}

export function tryAgainLabel(attempt: number, max: number): string {
  return `Try again (attempt ${attempt} of ${max})`;
}

export function doneSentence(termName: string, effectiveDate: string): string {
  return `Changes start this ${effectiveDate}. Past days stay as they were.`;
}

export function reviewTitle(count: number, termName: string): string {
  return `${count} change${count === 1 ? '' : 's'} to ${termName}`;
}

export function approveLabel(n: number): string {
  return n > 0 ? `Approve ${n} change${n === 1 ? '' : 's'}` : 'Turn on a change to approve';
}

function providerLabel(ai: string): string {
  const lower = ai.toLowerCase();
  if (lower.includes('claude')) return 'Anthropic';
  if (lower.includes('chatgpt')) return 'OpenAI';
  if (lower.includes('gemini')) return 'Google';
  return ai;
}

export function planStatusLabel(plan: PlanDTO): string {
  switch (plan.status) {
    case 'approved':
      return 'Approved';
    case 'discarded':
      return 'Declined';
    case 'stale':
      return 'Out of date';
    case 'failed':
      return 'Failed';
    default:
      return '';
  }
}

export function planSourceLabel(plan: PlanDTO): string | null {
  if (plan.source === 'mcp' && plan.client_name) return `From ${plan.client_name} chat`;
  return null;
}
