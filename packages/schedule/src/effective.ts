import { addDays, weekStartOf } from './dates';
import type { IsoDate } from './types';

export type EffectiveContext =
  | { kind: 'routine_editor'; today: IsoDate }
  | { kind: 'edit_every'; occurrence: IsoDate }
  | { kind: 'plan_repeat'; today: IsoDate; from: IsoDate }
  | { kind: 'import'; today: IsoDate; termStart: IsoDate };

/** Default effective dates (BACKEND_SETUP §3 "Effective dates") — the one implementation. */
export function effectiveFrom(ctx: EffectiveContext): IsoDate {
  switch (ctx.kind) {
    case 'routine_editor':
      return addDays(weekStartOf(ctx.today), 7);
    case 'edit_every':
      return ctx.occurrence;
    case 'plan_repeat': {
      const tomorrow = addDays(ctx.today, 1);
      return ctx.from < tomorrow ? tomorrow : ctx.from;
    }
    case 'import': {
      const tomorrow = addDays(ctx.today, 1);
      return ctx.termStart > ctx.today ? ctx.termStart : tomorrow;
    }
  }
}
