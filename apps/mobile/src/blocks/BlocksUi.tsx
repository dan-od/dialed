import { nextFreeSlot, weekdayOf, type IsoDate, type ResolvedBlock } from '@dialed/schedule';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AddForm, EditState, Perm } from './form';

export interface AddDraft extends AddForm {
  date: IsoDate;
  dirty: boolean;
  /** Flow 05 "Add to Mons": the block goes into the routine editor's draft for this weekday (no outbox). */
  mode?: 'routine';
  weekday?: number;
  routineId?: string;
}
export interface EditDraft {
  block: ResolvedBlock;
  /** Day chip of the block's own day (Mon = 0). */
  today: number;
  orig: EditState;
  cur: EditState;
  scope: 'once' | 'every';
}
/** What the Get a nudge sheet decided: permission after the iOS prompt, or "Not now". */
export type NudgeChoice = Perm | 'later';

interface Ui {
  add: AddDraft | null;
  setAdd: (d: AddDraft | null) => void;
  edit: EditDraft | null;
  setEdit: (d: EditDraft | null) => void;
  /** Row key shown with the "New" chip (5 s) and the 1.2 s flash. */
  highlight: string | null;
  flash: (key: string | null) => void;
  /** Set by the Add sheet before it opens Get a nudge; run once with the outcome. */
  nudge: NudgeSlot;
}

/** Holds the Add sheet's continuation while Get a nudge is open (a class, so it isn't render state). */
export class NudgeSlot {
  private fn: ((c: NudgeChoice) => void) | null = null;
  set(fn: (c: NudgeChoice) => void) {
    this.fn = fn;
  }
  run(c: NudgeChoice) {
    const fn = this.fn;
    this.fn = null;
    fn?.(c);
  }
}

const Ctx = createContext<Ui | null>(null);
export function useBlocksUi(): Ui {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBlocksUi outside BlocksUiProvider');
  return v;
}

/** Shared state for the stacked Flow 04 sheets (Add → Category / Get a nudge keep the half-filled form). */
export function BlocksUiProvider({ children }: { children: ReactNode }) {
  const [add, setAdd] = useState<AddDraft | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [nudge] = useState(() => new NudgeSlot());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((key: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    setHighlight(key);
    if (key) timer.current = setTimeout(() => setHighlight(null), 5000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const value = useMemo(
    () => ({ add, setAdd, edit, setEdit, highlight, flash, nudge }),
    [add, edit, highlight, flash, nudge],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Blank Add form: today, next free 5-minute slot for 1 h (Flow 04), alert off (D-32). */
export function newAddDraft(date: IsoDate, minute: number, day: ResolvedBlock[]): AddDraft {
  const slot = nextFreeSlot(day, minute);
  return {
    date,
    title: '',
    category_id: null,
    start: slot.start,
    end: slot.end,
    repeat: false,
    alert: null,
    overlapOk: false,
    dirty: false,
  };
}

export function newEditDraft(block: ResolvedBlock): EditDraft {
  const today = weekdayOf(block.date);
  const orig = {
    title: block.title,
    start: block.start_min,
    end: block.end_min,
    category_id: block.category_id,
    day: today,
  };
  return { block, today, orig, cur: orig, scope: 'once' };
}
