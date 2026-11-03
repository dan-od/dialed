export interface GuideProfile {
  first_name: string;
  about: string;
  priorities: string[];
  day_start: string;
  day_end: string;
  quiet_hours: string;
  parts_of_day: string;
  custom_phrases: string;
  limits: string;
}

export function renderGuide(template: string, profile: GuideProfile): string {
  const map: Record<string, string> = {
    'user.first_name': profile.first_name,
    'profile.about': profile.about,
    'profile.priorities': profile.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    'profile.day_start': profile.day_start,
    'profile.day_end': profile.day_end,
    'profile.quiet_hours': profile.quiet_hours,
    'profile.parts_of_day': profile.parts_of_day,
    'profile.custom_phrases': profile.custom_phrases,
    'profile.limits': profile.limits,
  };
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => map[key.trim()] ?? '');
}
