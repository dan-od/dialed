import type { PlanDTO } from '@dialed/contracts';
import { aiName } from '../config';

export interface FailureCopy {
  title: string;
  body: string;
  /** The main reason in plain words (validation failures). */
  reason?: string;
  canRetry: boolean;
  /** Show "Open Settings" (key problems). */
  settings: boolean;
}

type FailedPlan = Pick<PlanDTO, 'error_code' | 'validation_errors' | 'attempts'>;

/** Server-side redo limit (MAX_REDOS): first run + 2 redos. */
export const MAX_REDOS = 2;
const NETWORK = new Set(['provider_error', 'server_error', 'timeout']);
const VALIDATION_ORDER = [
  'protected_block',
  'overlap',
  'bad_time',
  'too_many_changes',
  'range_too_long',
];

/** What the failed-plan screen says. "Can't reach" only for real network or provider failures. */
export function failureCopy(plan: FailedPlan): FailureCopy {
  const ai = aiName();
  const code = plan.error_code ?? 'provider_error';
  const retriesLeft = plan.attempts < MAX_REDOS;
  const base = { canRetry: retriesLeft, settings: false };

  if (NETWORK.has(code)) {
    if (!retriesLeft) {
      return { ...base, title: `Still can’t reach ${ai}`, body: exhaustedSentence() };
    }
    // The time limit is named only for a real timeout; a provider error (e.g. a 400) says so plainly.
    if (code === 'server_error') {
      return {
        ...base,
        title: 'Couldn’t reach Dialed',
        body: 'Dialed couldn’t reach the server. Try again.',
      };
    }
    if (code === 'timeout') {
      return {
        ...base,
        title: `${ai} didn’t answer`,
        body: `${ai} didn’t answer within 60 seconds.`,
      };
    }
    return {
      ...base,
      title: `${ai} had a problem`,
      body: `${ai} returned an error instead of a plan. Try again.`,
    };
  }

  switch (code) {
    case 'validation_failed':
      return {
        ...base,
        title: 'That plan didn’t fit',
        body: `${ai} couldn’t make a plan that fits your schedule’s rules.`,
        reason: validationReason(plan.validation_errors),
      };
    case 'too_many_questions':
      return {
        ...base,
        title: 'Needs a bit more detail',
        body: `${ai} still wasn’t sure after two questions. Try again with the day, time and how long.`,
      };
    case 'provider_key_invalid':
      return {
        ...base,
        title: 'Your AI key was refused',
        body: `Your ${providerLabel(ai)} key was refused. Check it in Settings.`,
        settings: true,
      };
    case 'byo_key_required':
    case 'byo_key_unavailable':
      return {
        ...base,
        title: 'Your AI key is needed',
        body: `This plan uses your own ${providerLabel(ai)} key. Add it in Settings, then try again.`,
        settings: true,
      };
    case 'daily_limit':
      return {
        title: 'Today’s plans are used up',
        body: 'You’ve used today’s 30 plans on the Dialed server. Try again tomorrow or bring your own key.',
        canRetry: false,
        settings: false,
      };
    case 'cancelled':
      return {
        ...base,
        title: 'Plan cancelled',
        body: 'You stopped this plan. Your request is saved.',
      };
    default:
      return {
        ...base,
        title: `${ai} ran into a problem`,
        body: 'Something went wrong making this plan. Try again.',
      };
  }
}

/** The main reason a draft failed validation, in the Planner's words. */
function validationReason(errors: FailedPlan['validation_errors']): string {
  const main =
    VALIDATION_ORDER.map((c) => errors.filter((e) => e.code === c)).find(
      (list) => list.length > 0,
    ) ?? errors;
  const first = main[0];
  switch (first?.code) {
    case 'protected_block': {
      const what = first.subject ? `Your ${first.subject} class` : 'A class';
      const more = main.length - 1;
      return more > 0
        ? `${what} and ${more} more are protected. Say which classes to skip.`
        : `${what} is protected. Say which classes to skip.`;
    }
    case 'overlap':
      return 'Part of it clashed with another block. Try a different time.';
    case 'bad_time':
      return 'A time didn’t work: it ended before it started or was already past.';
    case 'too_many_changes':
      return 'It needed more than 25 changes. Try a smaller request.';
    case 'range_too_long':
      return 'It covered more than 120 days. Try a shorter stretch.';
    case undefined:
      return 'Try rewording it.';
    default:
      return 'Some changes didn’t match your schedule. Try again or reword it.';
  }
}

// The prototype adds "We'll keep trying in the background and notify you", but nothing queues a background
// retry yet (plan.retry has a handler only), so the copy doesn't promise one.
function exhaustedSentence(): string {
  return 'Your request is saved. Try again in a little while, or edit it.';
}

/** After "Out of date." on a stale review (prototype names the edit; the app doesn't know which one it was). */
export function staleLine(ai: string): string {
  return `Your schedule changed after ${ai} drafted this, so approving could clash.`;
}

export function staleSentence(detail?: string): string {
  return detail ?? 'Your schedule changed since this plan was drafted. Redo it so nothing clashes.';
}

/** Prototype `scrPlanLoading` steps; the first names the routine. */
export function draftingSteps(term: string | null): string[] {
  return [
    `Reading your ${term ?? 'schedule'}`,
    'Matching your categories',
    'Fitting it into your week',
    'Checking your limits',
  ];
}

/** "Attempt 2 of 3." under the error buttons; `attempts` counts redos. */
export function attemptLine(attempts: number): string {
  return `Attempt ${Math.min(attempts + 1, MAX_REDOS + 1)} of ${MAX_REDOS + 1}.`;
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
    case 'ready':
      return 'Ready';
    case 'question':
      return 'Question';
    default:
      return '';
  }
}

export function planSourceLabel(plan: PlanDTO): string | null {
  if (plan.source === 'mcp' && plan.client_name) return `From ${plan.client_name} chat`;
  return null;
}
