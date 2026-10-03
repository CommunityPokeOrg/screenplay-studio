import type {
  Beat,
  CharacterProfile,
  Doc,
  EntityKind,
  Episode,
  Idea,
  Project,
  Scene,
  Series,
  SyncRecord,
} from './types';

export const COLLECTION: Record<EntityKind, keyof Doc> = {
  project: 'projects',
  series: 'series',
  episode: 'episodes',
  scene: 'scenes',
  character: 'characters',
  beat: 'beats',
  idea: 'ideas',
};

export function emptyDoc(): Doc {
  return {
    projects: {},
    series: {},
    episodes: {},
    scenes: {},
    characters: {},
    beats: {},
    ideas: {},
  };
}

export function entityProjectId(kind: EntityKind, e: unknown): string {
  return kind === 'project' ? (e as Project).id : (e as { projectId: string }).projectId;
}

export function entityParentId(kind: EntityKind, e: unknown): string | null {
  switch (kind) {
    case 'series':
      return (e as Series).projectId;
    case 'episode':
      return (e as Episode).seriesId;
    case 'scene':
      return (e as Scene).episodeId;
    case 'beat':
      return (e as Beat).episodeId;
    case 'character':
      return (e as CharacterProfile).projectId;
    case 'idea':
      return (e as Idea).projectId;
    default:
      return null;
  }
}

/** One entity change waiting to be pushed to the worker. */
export interface PushChange {
  id: string;
  kind: EntityKind;
  projectId: string;
  parentId: string | null;
  /** Server rev the client based this edit on; -1 means "should not exist". */
  baseRev: number;
  data: unknown;
  deleted: boolean;
}

export interface PushResult {
  applied: { id: string; rev: number }[];
  conflicts: SyncRecord[];
}

export interface PullResult {
  records: SyncRecord[];
  watermark: number;
}

const KIND_BY_COLLECTION = new Map<keyof Doc, EntityKind>(
  (Object.entries(COLLECTION) as [EntityKind, keyof Doc][]).map(([k, c]) => [c, k]),
);

export function kindForId(doc: Doc, id: string): EntityKind | undefined {
  for (const [col, entities] of Object.entries(doc) as [keyof Doc, Record<string, unknown>][]) {
    if (entities[id]) return KIND_BY_COLLECTION.get(col);
  }
  return undefined;
}

/**
 * Build push changes for the given dirty/deleted ids. `baseRev` is the server
 * rev the local edit was made against (or -1 for new objects) — the worker
 * uses it for optimistic-concurrency conflict detection.
 */
export function buildPush(
  doc: Doc,
  dirtyIds: string[],
  deletedIds: string[],
  versions: Record<string, number>,
): PushChange[] {
  const out: PushChange[] = [];
  for (const id of dirtyIds) {
    const kind = kindForId(doc, id);
    if (!kind) continue;
    const e = (doc[COLLECTION[kind]] as Record<string, unknown>)[id];
    out.push({
      id,
      kind,
      projectId: entityProjectId(kind, e),
      parentId: entityParentId(kind, e),
      baseRev: versions[id] ?? -1,
      data: e,
      deleted: false,
    });
  }
  for (const id of deletedIds) {
    if (dirtyIds.includes(id)) continue;
    // kind/projectId are needed server-side only for bookkeeping; carry what we can.
    out.push({
      id,
      kind: 'scene', // kind is not load-bearing for deletes server-side
      projectId: '',
      parentId: null,
      baseRev: versions[id] ?? -1,
      data: null,
      deleted: true,
    });
  }
  return out;
}

/** Apply one server record to the doc (insert/update or tombstone). */
export function applyRecord(doc: Doc, rec: SyncRecord): Doc {
  const col = COLLECTION[rec.kind];
  if (!col) return doc;
  const table = doc[col] as Record<string, unknown>;
  const next = { ...table };
  if (rec.deleted) delete next[rec.id];
  else next[rec.id] = rec.data;
  return { ...doc, [col]: next } as Doc;
}

/** Rebuild a whole doc from a full pull (e.g. first sync on a new device). */
export function docFromRecords(records: SyncRecord[]): Doc {
  let doc = emptyDoc();
  for (const rec of [...records].sort((a, b) => a.updatedAt - b.updatedAt)) {
    doc = applyRecord(doc, rec);
  }
  return doc;
}

/**
 * Decide which pulled records are safe to apply: anything the user is also
 * editing locally (dirty or already conflicted) is skipped so local work is
 * never silently overwritten.
 */
export function safeToApply(
  rec: SyncRecord,
  dirtyIds: ReadonlySet<string>,
  conflictIds: ReadonlySet<string>,
): boolean {
  return !dirtyIds.has(rec.id) && !conflictIds.has(rec.id);
}
