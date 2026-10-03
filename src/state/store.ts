import { seedDoc } from '../lib/seed';
import { applyRecord, COLLECTION, emptyDoc, safeToApply } from '../lib/sync';
import type {
  Beat,
  Block,
  CharacterProfile,
  Doc,
  EntityKind,
  Episode,
  Idea,
  Project,
  Scene,
  Series,
  SyncRecord,
} from '../lib/types';

export type Entity =
  | Project
  | Series
  | Episode
  | Scene
  | CharacterProfile
  | Beat
  | Idea;

export interface Selection {
  projectId: string | null;
  episodeId: string | null;
  sceneId: string | null;
}

export type Panel = 'script' | 'beats' | 'characters' | 'ideas' | 'files';

export interface Conflict {
  id: string;
  kind: EntityKind;
  server: SyncRecord;
}

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface AppState {
  hydrated: boolean;
  doc: Doc;
  selection: Selection;
  panel: Panel;
  dirty: string[];
  deleted: string[];
  versions: Record<string, number>;
  conflicts: Conflict[];
  watermark: number;
  syncStatus: SyncStatus;
  syncError: string | null;
}

export const initialState: AppState = {
  hydrated: false,
  doc: emptyDoc(),
  selection: { projectId: null, episodeId: null, sceneId: null },
  panel: 'script',
  dirty: [],
  deleted: [],
  versions: {},
  conflicts: [],
  watermark: 0,
  syncStatus: 'idle',
  syncError: null,
};

export type Action =
  | { type: 'hydrate'; doc: Doc; versions: Record<string, number>; watermark: number }
  | { type: 'select'; patch: Partial<Selection> }
  | { type: 'setPanel'; panel: Panel }
  | { type: 'upsert'; kind: EntityKind; entity: Entity }
  | { type: 'updateBlocks'; sceneId: string; blocks: Block[] }
  | { type: 'remove'; kind: EntityKind; id: string }
  | { type: 'moveScene'; sceneId: string; toIndex: number }
  | { type: 'pushed'; applied: { id: string; rev: number }[]; deletedIds: string[] }
  | { type: 'pulled'; records: SyncRecord[]; watermark: number }
  | { type: 'conflicts'; conflicts: Conflict[] }
  | { type: 'resolveConflict'; id: string; choice: 'mine' | 'theirs' }
  | { type: 'setSync'; status: SyncStatus; error?: string | null };

function markDirty(dirty: string[], id: string): string[] {
  return dirty.includes(id) ? dirty : [...dirty, id];
}

function cascadeDelete(doc: Doc, kind: EntityKind, id: string): string[] {
  const ids = [id];
  if (kind === 'project') {
    for (const t of ['series', 'episodes', 'scenes', 'characters', 'beats', 'ideas'] as const) {
      for (const [eid, e] of Object.entries(doc[t]) as [string, { projectId: string }][]) {
        if (e.projectId === id) ids.push(eid);
      }
    }
  } else if (kind === 'series') {
    for (const [eid, e] of Object.entries(doc.episodes)) {
      if (e.seriesId === id) {
        ids.push(eid);
        for (const [sid, s] of Object.entries(doc.scenes)) {
          if (s.episodeId === eid) ids.push(sid);
        }
        for (const [bid, b] of Object.entries(doc.beats)) {
          if (b.episodeId === eid) ids.push(bid);
        }
      }
    }
  } else if (kind === 'episode') {
    for (const [sid, s] of Object.entries(doc.scenes)) {
      if (s.episodeId === id) ids.push(sid);
    }
    for (const [bid, b] of Object.entries(doc.beats)) {
      if (b.episodeId === id) ids.push(bid);
    }
  }
  return ids;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate': {
      // Default selection: first project, its first episode, first scene.
      const projectId = Object.keys(action.doc.projects)[0] ?? null;
      const episodeId = projectId
        ? (Object.values(action.doc.episodes)
            .filter((e) => e.projectId === projectId)
            .sort((a, b) => a.order - b.order)[0]?.id ?? null)
        : null;
      const sceneId = episodeId
        ? (Object.values(action.doc.scenes)
            .filter((s) => s.episodeId === episodeId)
            .sort((a, b) => a.order - b.order)[0]?.id ?? null)
        : null;
      return {
        ...state,
        hydrated: true,
        doc: action.doc,
        versions: action.versions,
        watermark: action.watermark,
        selection: { projectId, episodeId, sceneId },
      };
    }

    case 'select':
      return { ...state, selection: { ...state.selection, ...action.patch } };

    case 'setPanel':
      return { ...state, panel: action.panel };

    case 'upsert': {
      const col = COLLECTION[action.kind];
      const prev = (state.doc[col] as Record<string, { id: string }>)[action.entity.id];
      const merged = prev ? { ...prev, ...action.entity } : action.entity;
      return {
        ...state,
        doc: { ...state.doc, [col]: { ...state.doc[col], [action.entity.id]: merged } } as Doc,
        dirty: markDirty(state.dirty, action.entity.id),
      };
    }

    case 'updateBlocks': {
      const scene = state.doc.scenes[action.sceneId];
      if (!scene) return state;
      return {
        ...state,
        doc: {
          ...state.doc,
          scenes: { ...state.doc.scenes, [action.sceneId]: { ...scene, blocks: action.blocks } },
        },
        dirty: markDirty(state.dirty, action.sceneId),
      };
    }

    case 'remove': {
      const ids = cascadeDelete(state.doc, action.kind, action.id);
      const idSet = new Set(ids);
      const doc: Doc = { ...state.doc };
      for (const key of Object.keys(doc) as (keyof Doc)[]) {
        const table = doc[key] as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [eid, e] of Object.entries(table)) {
          if (!idSet.has(eid)) next[eid] = e;
        }
        doc[key] = next as never;
      }
      const sel = { ...state.selection };
      if (sel.sceneId && idSet.has(sel.sceneId)) sel.sceneId = null;
      if (sel.episodeId && idSet.has(sel.episodeId)) sel.episodeId = null;
      if (sel.projectId && idSet.has(sel.projectId)) sel.projectId = null;
      const existing = new Set(state.deleted);
      const deleted = [...state.deleted, ...ids.filter((i) => !existing.has(i))];
      return {
        ...state,
        doc,
        selection: sel,
        dirty: state.dirty.filter((i) => !idSet.has(i)),
        deleted,
        conflicts: state.conflicts.filter((c) => !idSet.has(c.id)),
      };
    }

    case 'moveScene': {
      const scene = state.doc.scenes[action.sceneId];
      if (!scene) return state;
      const siblings = Object.values(state.doc.scenes)
        .filter((s) => s.episodeId === scene.episodeId)
        .sort((a, b) => a.order - b.order);
      const from = siblings.findIndex((s) => s.id === action.sceneId);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(siblings.length - 1, action.toIndex));
      if (to === from) return state;
      siblings.splice(to, 0, siblings.splice(from, 1)[0]);
      const scenes = { ...state.doc.scenes };
      let dirty = state.dirty;
      siblings.forEach((s, i) => {
        if (s.order !== i) {
          scenes[s.id] = { ...s, order: i };
          dirty = markDirty(dirty, s.id);
        }
      });
      return { ...state, doc: { ...state.doc, scenes }, dirty };
    }

    case 'pushed': {
      const appliedIds = new Set(action.applied.map((a) => a.id));
      const deletedIds = new Set(action.deletedIds);
      const versions = { ...state.versions };
      for (const a of action.applied) versions[a.id] = a.rev;
      return {
        ...state,
        versions,
        dirty: state.dirty.filter((i) => !appliedIds.has(i)),
        deleted: state.deleted.filter((i) => !deletedIds.has(i)),
      };
    }

    case 'pulled': {
      const dirtySet = new Set(state.dirty);
      const conflictSet = new Set(state.conflicts.map((c) => c.id));
      let doc = state.doc;
      const versions = { ...state.versions };
      for (const rec of action.records) {
        if (!safeToApply(rec, dirtySet, conflictSet)) continue;
        doc = applyRecord(doc, rec);
        versions[rec.id] = rec.rev;
      }
      return { ...state, doc, versions, watermark: action.watermark };
    }

    case 'conflicts': {
      const existing = new Set(state.conflicts.map((c) => c.id));
      const next = [...state.conflicts, ...action.conflicts.filter((c) => !existing.has(c.id))];
      return { ...state, conflicts: next, syncStatus: 'conflict' };
    }

    case 'resolveConflict': {
      const conflict = state.conflicts.find((c) => c.id === action.id);
      if (!conflict) return state;
      const conflicts = state.conflicts.filter((c) => c.id !== action.id);
      const versions = { ...state.versions, [action.id]: conflict.server.rev };
      if (action.choice === 'mine') {
        // Re-push: local doc wins, but based on the server's latest rev.
        return {
          ...state,
          conflicts,
          versions,
          dirty: markDirty(state.dirty, action.id),
          syncStatus: conflicts.length ? 'conflict' : 'idle',
        };
      }
      let doc = applyRecord(state.doc, conflict.server);
      doc = { ...doc };
      return {
        ...state,
        doc,
        conflicts,
        versions,
        dirty: state.dirty.filter((i) => i !== action.id),
        syncStatus: conflicts.length ? 'conflict' : 'idle',
      };
    }

    case 'setSync':
      return { ...state, syncStatus: action.status, syncError: action.error ?? null };

    default:
      return state;
  }
}

export function seededState(): AppState {
  const doc = seedDoc();
  const firstProject = Object.keys(doc.projects)[0] ?? null;
  const firstEpisode = Object.values(doc.episodes).sort((a, b) => a.order - b.order)[0]?.id ?? null;
  const firstScene = Object.values(doc.scenes).sort((a, b) => a.order - b.order)[0]?.id ?? null;
  return {
    ...initialState,
    hydrated: true,
    doc,
    selection: { projectId: firstProject, episodeId: firstEpisode, sceneId: firstScene },
  };
}
