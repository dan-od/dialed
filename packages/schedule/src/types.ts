/** ISO calendar date, YYYY-MM-DD, in the Planner's time zone. */
export type IsoDate = string;
/** Local wall-clock minutes from midnight, 0–1440. */
export type Minutes = number;

export interface Category {
  id: string;
  name: string;
  group_name: string;
  color_dark: string;
  color_light: string;
  weight: number;
  quiet: boolean;
  protected: boolean;
  sort: number;
  deleted_at?: string | null;
}

export interface Term {
  id: string;
  name: string;
  starts_on: IsoDate;
  ends_on: IsoDate;
  is_draft: boolean;
  deleted_at?: string | null;
}

export interface Routine {
  id: string;
  term_id: string;
  name: string;
}

export interface RoutineBlock {
  id: string;
  routine_id: string;
  weekday: number; // 0 = Monday
  start_min: Minutes;
  end_min: Minutes;
  title: string;
  category_id: string;
  effective_from: IsoDate;
  effective_to: IsoDate | null;
  deleted_at?: string | null;
}

export type OverrideKind = 'skip' | 'modify' | 'add' | 'move';

export interface Override {
  id: string;
  on_date: IsoDate;
  kind: OverrideKind;
  routine_block_id: string | null;
  title: string | null;
  start_min: Minutes | null;
  end_min: Minutes | null;
  category_id: string | null;
  moved_to_date: IsoDate | null;
  note: string | null;
  deleted_at?: string | null;
}

export interface ScheduleData {
  categories: Category[];
  terms: Term[];
  routines: Routine[];
  routineBlocks: RoutineBlock[];
  overrides: Override[];
}

export interface ResolvedBlock {
  /** Stable per-occurrence key: `<routine_block_id|override_id>:<date>` (Live Activity block_key shape). */
  key: string;
  date: IsoDate;
  routine_block_id: string | null;
  override_id: string | null;
  title: string;
  start_min: Minutes;
  end_min: Minutes;
  category_id: string;
  category: Category | null;
  quiet: boolean;
  protected: boolean;
  source: 'routine' | 'one_off';
}

export interface ResolvedDay {
  date: IsoDate;
  weekday: number;
  term_id: string | null;
  blocks: ResolvedBlock[];
}
