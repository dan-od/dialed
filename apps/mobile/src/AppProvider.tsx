import type { Mutation, PullResponse, TokensOut, UserOut } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
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
import { AppState } from 'react-native';
import { ApiClient, type TokenSource } from './api/client';
import { API_BASE_URL } from './config';
import { Blocks } from './blocks/service';
import { SQLiteStore } from './data/sqliteStore';
import type { LocalData, LocalStore } from './data/types';
import { haptic } from './lib/haptics';
import { cancelReminders, rescheduleReminders } from './notifications/reminders';
import {
  clearPending,
  clearSession,
  readSession,
  writeSession,
  type StoredSession,
} from './session/storage';
import { SyncEngine, type SyncStatus } from './sync/engine';
import { nextTheme, ThemeProvider, type ThemePref } from './theme/theme';
import { useToast } from './ui/Toast';

type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: UserOut };

interface AppValue {
  session: SessionState;
  api: ApiClient;
  data: LocalData | null;
  sync: SyncStatus;
  online: boolean;
  /** Flow 04 block changes (local first, through the outbox). */
  blocks: Blocks;
  /** After verify / login / reset: persist tokens, start syncing (pull since=0). */
  signIn(t: TokensOut): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): void;
  toggleTheme(isLight: boolean): Promise<void>;
}

const Ctx = createContext<AppValue | null>(null);
export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Holds the Keychain session for the api client (outside React state: read on every request). */
class SessionTokens implements TokenSource {
  session: StoredSession | null = null;
  onEnded: (reason: 'revoked' | 'signout') => Promise<void> = async () => {};
  current() {
    return this.session;
  }
  async save(t: { access_token: string; refresh_token: string }) {
    if (!this.session) return;
    this.session = {
      ...this.session,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
    };
    await writeSession(this.session);
  }
  ended(reason: 'revoked') {
    return this.onEnded(reason);
  }
}

// One app, one session: a module-level holder the api client reads on every request.
const tokens = new SessionTokens();
const api = new ApiClient(API_BASE_URL, tokens);

/** The running engine, outside React state (the Blocks service enqueues through it). */
class EngineHub {
  private engine: SyncEngine | null = null;
  attach(e: SyncEngine | null) {
    this.engine = e;
  }
  async enqueue(m: Mutation) {
    if (!this.engine) throw new Error('Not signed in');
    await this.engine.enqueue(m);
  }
}

const EMPTY_SYNC: SyncStatus = { pending: 0, syncing: false, problem: null, hasData: false };

export function AppProvider({
  children,
  store: injected,
}: {
  children: ReactNode;
  store?: LocalStore;
}) {
  const toast = useToast();
  const store = useMemo(() => injected ?? new SQLiteStore(), [injected]);
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [data, setData] = useState<LocalData | null>(null);
  const [sync, setSync] = useState<SyncStatus>(EMPTY_SYNC);
  const [online, setOnline] = useState(true);
  const engineRef = useRef<SyncEngine | null>(null);

  const reload = useCallback(async () => setData(await store.load()), [store]);
  const [hub] = useState(() => new EngineHub());
  const blocks = useMemo(() => new Blocks(store, (m) => hub.enqueue(m)), [store, hub]);

  // Local reminders follow the data: next 48 h of explicit block alerts (D-32), quiet hours respected.
  useEffect(() => {
    const p = data?.profile;
    if (!data || !p) return;
    void rescheduleReminders(data.schedule, p.profile_json?.block_alerts ?? {}, p.time_zone, {
      start: p.quiet_start_min,
      end: p.quiet_end_min,
    }).catch(() => {});
  }, [data]);

  const startEngine = useCallback(async () => {
    engineRef.current?.stop();
    const engine = new SyncEngine(
      store,
      {
        pull: (since, cursor) =>
          api.request<PullResponse>(
            'GET',
            `/v1/sync/pull?since=${since}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          ),
        push: (mutations) => api.request('POST', '/v1/sync/push', { mutations }),
      },
      {
        changed: () => void reload(),
        status: setSync,
        synced: (n) => {
          toast(`Synced ${n} change${n > 1 ? 's' : ''}.`);
          haptic.light();
        },
        conflict: ({ title, reapply }) =>
          toast(`${title} was changed on another device. Your edit wasn’t applied.`, {
            label: 'Reapply',
            onPress: () => void reapply(),
          }),
        rejected: ({ message }) => toast(message),
      },
    );
    engineRef.current = engine;
    hub.attach(engine);
    await engine.start();
    await reload();
    void engine.sync();
  }, [hub, reload, store, toast]);

  /** sessionEnded() (identity-session contract): wipe SQLite + Keychain, back to Welcome. */
  const sessionEnded = useCallback(
    async (reason: 'revoked' | 'signout') => {
      engineRef.current?.stop();
      engineRef.current = null;
      hub.attach(null);
      tokens.session = null;
      await Promise.allSettled([store.wipe(), clearSession(), clearPending(), cancelReminders()]);
      // Live Activities, local notifications, widget snapshot and device unregister join here with Flow 08.
      setData(null);
      setSync(EMPTY_SYNC);
      setSession({ status: 'signedOut' });
      if (reason === 'revoked') toast('You were signed out. Sign in again.');
    },
    [hub, store, toast],
  );
  useEffect(() => {
    tokens.onEnded = sessionEnded;
  }, [sessionEnded]);

  // Launch: Keychain + SQLite only — never waits on the network (C-0103).
  useEffect(() => {
    let alive = true;
    (async () => {
      await store.init();
      const s = await readSession();
      if (!alive) return;
      tokens.session = s;
      if (s) {
        setSession({ status: 'signedIn', user: s.user });
        await startEngine();
      } else {
        await store.wipe(); // a Keychain-less device must not show someone's data
        setSession({ status: 'signedOut' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [startEngine, store]);

  // Foreground and network regain trigger push + pull.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void engineRef.current?.sync();
    });
    const net = Network.addNetworkStateListener((st) => {
      const up = st.isConnected !== false && st.isInternetReachable !== false;
      setOnline(up);
      if (up) void engineRef.current?.sync();
    });
    Network.getNetworkStateAsync()
      .then((st) => setOnline(st.isConnected !== false && st.isInternetReachable !== false))
      .catch(() => {});
    return () => {
      sub.remove();
      net.remove();
    };
  }, []);

  const signIn = useCallback(
    async (t: TokensOut) => {
      await store.wipe();
      tokens.session = {
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        user: t.user,
      };
      await writeSession(tokens.session);
      await clearPending();
      setSession({ status: 'signedIn', user: t.user });
      await startEngine();
    },
    [startEngine, store],
  );

  const signOut = useCallback(async () => {
    await api.request('POST', '/v1/auth/logout').catch(() => {}); // best effort; local wipe always happens
    await sessionEnded('signout');
    toast('Signed out.');
  }, [sessionEnded, toast]);

  const toggleTheme = useCallback(
    async (isLight: boolean) => {
      const p = data?.profile;
      if (!p || !engineRef.current) return;
      const next = nextTheme(p.theme, isLight);
      const m: Mutation = {
        client_mutation_id: randomUUID(),
        entity: 'profile',
        op: 'upsert',
        base_version: p.version,
        fields: { theme: next },
      };
      await engineRef.current.enqueue(m);
      toast(next === 'light' ? 'Light theme' : 'Dark theme');
    },
    [data?.profile, toast],
  );

  const value: AppValue = {
    session,
    api,
    data,
    sync,
    online: online && sync.problem !== 'offline',
    blocks,
    signIn,
    signOut,
    syncNow: () => void engineRef.current?.sync(),
    toggleTheme,
  };
  const pref: ThemePref = data?.profile?.theme ?? 'system';
  return (
    <Ctx.Provider value={value}>
      <ThemeProvider pref={pref}>{children}</ThemeProvider>
    </Ctx.Provider>
  );
}
