import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalStore } from '../data/types';

const DEBOUNCE_MS = 500;
const META_KEY = 'plan_draft';

export function useDraft(store: LocalStore) {
  const [text, setText] = useState('');
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void store.getMeta(META_KEY).then((v) => {
      if (v && !loaded.current) setText(v);
      loaded.current = true;
    });
  }, [store]);

  const update = useCallback(
    (next: string) => {
      setText(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void store.setMeta(META_KEY, next);
      }, DEBOUNCE_MS);
    },
    [store],
  );

  const clear = useCallback(() => {
    setText('');
    clearTimeout(timer.current);
    void store.setMeta(META_KEY, '');
  }, [store]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { text, update, clear };
}
