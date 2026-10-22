import type { ScheduleData } from '@dialed/schedule';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../AppProvider';
import type { AlertChoice } from '../blocks/service';
import { baseWeek, draftOps, type RoutineDraft } from './draft';

const key = (routineId: string) => `routine_draft:${routineId}`;
let n = 0;
const localId = () => `draft-${Date.now()}-${n++}`;

interface Stored {
  draft: RoutineDraft;
  alerts: Record<string, AlertChoice>;
}

interface Ui {
  draft: RoutineDraft | null;
  alerts: Record<string, AlertChoice>;
  /** The weekday tab the editor shows (Mon = 0). */
  day: number;
  setDay: (d: number) => void;
  /** Just-added row in the editor (surf2 highlight). */
  highlight: string | null;
  setHighlight: (id: string | null) => void;
  /** Open a routine: the draft left on this phone (app was closed mid-edit) or the saved week. */
  open: (routineId: string, data: ScheduleData) => Promise<void>;
  update: (fn: (d: RoutineDraft) => RoutineDraft) => void;
  setAlert: (blockId: string, a: AlertChoice) => void;
  /** Drop the local draft (Discard, or after Save). */
  clear: () => Promise<void>;
  dirty: boolean;
}

/** The latest draft, outside render (callbacks read it without stale closures). */
class Latest {
  private v: Stored | null = null;
  get() {
    return this.v;
  }
  set(v: Stored | null) {
    this.v = v;
  }
}

const Ctx = createContext<Ui | null>(null);
export function useRoutinesUi(): Ui {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRoutinesUi outside RoutinesUiProvider');
  return v;
}

/**
 * The routine editor's draft (Flow 05). Kept on this phone per routine (store meta, wiped with the session),
 * so leaving or killing the app doesn't lose edits; nothing reaches the outbox until Save.
 */
export function RoutinesUiProvider({ children }: { children: ReactNode }) {
  const { store } = useApp();
  const [stored, setStored] = useState<Stored | null>(null);
  const [day, setDay] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [latest] = useState(() => new Latest());

  const persist = useCallback(
    (next: Stored | null, routineId?: string) => {
      latest.set(next);
      setStored(next);
      const id = next?.draft.routineId ?? routineId;
      if (!id) return;
      void store.setMeta(key(id), next ? JSON.stringify(next) : '').catch(() => {});
    },
    [store, latest],
  );

  const open = useCallback(
    async (routineId: string, data: ScheduleData) => {
      let next: Stored | null = null;
      try {
        const raw = await store.getMeta(key(routineId));
        if (raw) next = JSON.parse(raw) as Stored;
      } catch {
        next = null;
      }
      if (!next || next.draft.routineId !== routineId)
        next = { draft: baseWeek(data, routineId), alerts: {} };
      latest.set(next);
      setStored(next);
      setHighlight(null);
    },
    [store, latest],
  );

  const update = useCallback(
    (fn: (d: RoutineDraft) => RoutineDraft) => {
      const cur = latest.get();
      if (!cur) return;
      persist({ ...cur, draft: fn(cur.draft) });
    },
    [persist, latest],
  );
  const setAlert = useCallback(
    (blockId: string, a: AlertChoice) => {
      const cur = latest.get();
      if (!cur) return;
      persist({ ...cur, alerts: { ...cur.alerts, [blockId]: a } });
    },
    [persist, latest],
  );
  const clear = useCallback(async () => {
    const id = latest.get()?.draft.routineId;
    latest.set(null);
    setStored(null);
    if (id) await store.setMeta(key(id), '').catch(() => {});
  }, [store, latest]);

  const draft = stored?.draft ?? null;
  const dirty = useMemo(() => (draft ? draftOps(draft, localId).length > 0 : false), [draft]);
  const value = useMemo(
    () => ({
      draft,
      alerts: stored?.alerts ?? {},
      day,
      setDay,
      highlight,
      setHighlight,
      open,
      update,
      setAlert,
      clear,
      dirty,
    }),
    [draft, stored?.alerts, day, highlight, open, update, setAlert, clear, dirty],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
