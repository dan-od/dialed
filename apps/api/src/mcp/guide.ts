import { renderGuide as baseRender, type GuideProfile } from '@dialed/planning';

type Row = Record<string, unknown>;

function minutesToClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `{"max_work_hours_per_day":12}` -> "- max work hours per day: 12"; strings pass through. */
function formatLimits(limits: unknown): string {
  if (limits == null) return '';
  if (typeof limits !== 'object') return String(limits);
  return Object.entries(limits as Record<string, unknown>)
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join('\n');
}

export function renderGuide(template: string, user: Row): string {
  const profileJson = (user.profile_json ?? {}) as Record<string, unknown>;

  const profile: GuideProfile = {
    first_name: String(user.display_name).split(' ')[0] ?? 'there',
    about: String(profileJson.about ?? ''),
    priorities: Array.isArray(profileJson.priorities) ? (profileJson.priorities as string[]) : [],
    day_start: minutesToClock(Number(user.day_start_min)),
    day_end: minutesToClock(Number(user.day_end_min)),
    quiet_hours: `${minutesToClock(Number(user.quiet_start_min))} to ${minutesToClock(Number(user.quiet_end_min))}`,
    parts_of_day: String(profileJson.parts_of_day ?? ''),
    custom_phrases: String(profileJson.custom_phrases ?? ''),
    limits: formatLimits(profileJson.limits),
  };

  return baseRender(template, profile);
}
