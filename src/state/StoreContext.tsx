import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { debounce, idbGet, idbSet } from '../lib/idb';
import { buildPush } from '../lib/sync';
import { uid } from '../lib/text';
import type { Doc, SyncRecord } from '../lib/types';
import {
  initialState,
  reducer,
  seededState,
} from './store';
import type { Action, AppState, Conflict } from './store';

const SNAPSHOT_KEY = 'snapshot';
const BACKUP_DEBOUNCE_MS = 800;
const PUSH_DEBOUNCE_MS = 2500;
const SYNC_INTERVAL_MS = 15000;

interface Snapshot {
  doc: Doc;
  versions: Record<string, number>;
  watermark: number;
}

interface StoreCtx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  syncNow: () => Promise<void>;
  userId: string;
}

const Ctx = createContext<StoreCtx | null>(null);

function getUserId(): string {
  let id = localStorage.getItem('ss-user-id');
  if (!id) {
    id = uid();
    localStorage.setItem('ss-user-id', id);
  }
  return id;
}

function getSyncToken(): string | null {
  return localStorage.getItem('ss-sync-token');
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncing = useRef(false);
  const userId = useMemo(getUserId, []);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': userId,
    };
    const token = getSyncToken();
    if (token) h['authorization'] = `Bearer ${token}`;
    return h;
  }, [userId]);

  // --- Cloud sync: push dirty changes, then pull everything since our watermark.
  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    if (!navigator.onLine) {
      dispatch({ type: 'setSync', status: 'offline' });
      return;
    }
    syncing.current = true;
    dispatch({ type: 'setSync', status: 'syncing' });
    try {
      const s = stateRef.current;

      if (s.dirty.length || s.deleted.length) {
        const changes = buildPush(s.doc, s.dirty, s.deleted, s.versions);
        const res = await fetch('/api/sync/push', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ changes }),
        });
        if (!res.ok) throw new Error(`push failed: ${res.status}`);
        const body = (await res.json()) as {
          applied: { id: string; rev: number }[];
          conflicts: SyncRecord[];
        };
        const appliedIds = new Set(body.applied.map((a) => a.id));
        dispatch({
          type: 'pushed',
          applied: body.applied,
          deletedIds: s.deleted.filter((id) => appliedIds.has(id) || true),
        });
        if (body.conflicts.length) {
          const conflicts: Conflict[] = body.conflicts.map((rec) => ({
            id: rec.id,
            kind: rec.kind,
            server: rec,
          }));
          dispatch({ type: 'conflicts', conflicts });
        }
      }

      const s2 = stateRef.current;
      const res = await fetch(`/api/sync/pull?since=${s2.watermark}`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error(`pull failed: ${res.status}`);
      const body = (await res.json()) as { records: SyncRecord[]; watermark: number };
      dispatch({ type: 'pulled', records: body.records, watermark: body.watermark });

      const finalConflicts = stateRef.current.conflicts.length;
      dispatch({ type: 'setSync', status: finalConflicts ? 'conflict' : 'synced' });
    } catch (e) {
      dispatch({ type: 'setSync', status: 'error', error: String(e) });
    } finally {
      syncing.current = false;
    }
  }, [headers]);

  // --- Hydrate from the IndexedDB backup (or seed), then pull.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await idbGet<Snapshot>(SNAPSHOT_KEY);
        if (!cancelled && snap?.doc) {
          dispatch({ type: 'hydrate', doc: snap.doc, versions: snap.versions ?? {}, watermark: snap.watermark ?? 0 });
          return;
        }
      } catch {
        // IndexedDB unavailable — fall through to seed.
      }
      if (!cancelled) {
        const seeded = seededState();
        dispatch({ type: 'hydrate', doc: seeded.doc, versions: {}, watermark: 0 });
      }
    })();
  }, []);

  // --- Debounced local backup on every doc change.
  const backup = useMemo(
    () =>
      debounce((snap: Snapshot) => {
        idbSet(SNAPSHOT_KEY, snap).catch(() => undefined);
      }, BACKUP_DEBOUNCE_MS),
    [],
  );
  useEffect(() => {
    if (!state.hydrated) return;
    backup({ doc: state.doc, versions: state.versions, watermark: state.watermark });
  }, [state.hydrated, state.doc, state.versions, state.watermark, backup]);

  // --- Trigger an initial pull once hydrated.
  const didInitialSync = useRef(false);
  useEffect(() => {
    if (state.hydrated && !didInitialSync.current) {
      didInitialSync.current = true;
      void syncNow();
    }
  }, [state.hydrated, syncNow]);

  // --- Debounced push after local edits + periodic sync + online recovery.
  const schedulePush = useMemo(() => debounce(() => void syncNow(), PUSH_DEBOUNCE_MS), [syncNow]);
  useEffect(() => {
    if (state.dirty.length || state.deleted.length) schedulePush();
  }, [state.dirty, state.deleted, schedulePush]);

  useEffect(() => {
    const interval = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const onOnline = () => void syncNow();
    const onOffline = () => dispatch({ type: 'setSync', status: 'offline' });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncNow]);

  const value = useMemo(
    () => ({ state, dispatch, syncNow, userId }),
    [state, syncNow, userId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}
