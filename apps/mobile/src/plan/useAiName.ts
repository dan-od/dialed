import { useSyncExternalStore } from 'react';
import { aiName } from '../config';

let _version = 0;
const listeners = new Set<() => void>();

export function notifyAiNameChanged() {
  _version++;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return aiName();
}

export function useAiName(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
