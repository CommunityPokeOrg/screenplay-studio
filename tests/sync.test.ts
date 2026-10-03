import { describe, expect, it } from 'vitest';
import {
  applyRecord,
  buildPush,
  docFromRecords,
  emptyDoc,
  safeToApply,
} from '../src/lib/sync';
import { applyPush } from '../worker/core';
import type { ObjectStore, SyncObjectRow } from '../worker/core';
import type { Doc, Project, Scene, SyncRecord } from '../src/lib/types';

const project: Project = { id: 'p1', title: 'T', author: 'A', description: '' };
const scene: Scene = {
  id: 's1',
  projectId: 'p1',
  episodeId: 'e1',
  title: 'S',
  order: 0,
  synopsis: '',
  blocks: [],
};

function docWith(): Doc {
  return { ...emptyDoc(), projects: { p1: project }, scenes: { s1: scene } };
}

class MemStore implements ObjectStore {
  rows = new Map<string, SyncObjectRow>();
  async get(userId: string, id: string) {
    return this.rows.get(`${userId}:${id}`);
  }
  async put(row: SyncObjectRow) {
    this.rows.set(`${row.user_id}:${row.id}`, row);
  }
  async listSince(userId: string, since: number) {
    return [...this.rows.values()]
      .filter((r) => r.user_id === userId && r.updated_at >= since)
      .sort((a, b) => a.updated_at - b.updated_at);
  }
}

describe('buildPush', () => {
  it('creates a baseRev=-1 change for never-synced entities', () => {
    const changes = buildPush(docWith(), ['s1', 'p1'], [], {});
    const c = changes.find((x) => x.id === 's1')!;
    expect(c.baseRev).toBe(-1);
    expect(c.kind).toBe('scene');
    expect(c.projectId).toBe('p1');
    expect(c.parentId).toBe('e1');
  });

  it('uses the known server rev for synced entities', () => {
    const changes = buildPush(docWith(), ['s1'], [], { s1: 3 });
    expect(changes[0].baseRev).toBe(3);
  });
});

describe('applyPush (worker core) — conflict detection', () => {
  it('inserts new objects at rev 1', async () => {
    const store = new MemStore();
    const out = await applyPush(store, 'u', [
      { id: 's1', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: -1, data: scene, deleted: false },
    ]);
    expect(out.applied).toEqual([{ id: 's1', rev: 1 }]);
    expect(out.conflicts).toHaveLength(0);
  });

  it('increments rev on a matching baseRev', async () => {
    const store = new MemStore();
    await applyPush(store, 'u', [
      { id: 's1', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: -1, data: scene, deleted: false },
    ]);
    const out = await applyPush(store, 'u', [
      { id: 's1', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: 1, data: { ...scene, title: 'S2' }, deleted: false },
    ]);
    expect(out.applied).toEqual([{ id: 's1', rev: 2 }]);
  });

  it('rejects a stale baseRev and returns the server record', async () => {
    const store = new MemStore();
    await applyPush(store, 'u', [
      { id: 's1', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: -1, data: scene, deleted: false },
    ]);
    // second device pushes with baseRev it never saw (0) — should conflict
    const out = await applyPush(store, 'u', [
      { id: 's1', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: 0, data: scene, deleted: false },
    ]);
    expect(out.applied).toHaveLength(0);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].rev).toBe(1);
    expect((out.conflicts[0].data as Scene).title).toBe('S');
  });

  it('returns a tombstone conflict when the server object is gone', async () => {
    const store = new MemStore();
    const out = await applyPush(store, 'u', [
      { id: 'gone', kind: 'scene', projectId: 'p1', parentId: 'e1', baseRev: 4, data: scene, deleted: false },
    ]);
    expect(out.conflicts[0].deleted).toBe(true);
    expect(out.applied).toHaveLength(0);
  });
});

describe('client-side record application', () => {
  const rec = (over: Partial<SyncRecord> = {}): SyncRecord => ({
    id: 's1',
    kind: 'scene',
    projectId: 'p1',
    parentId: 'e1',
    rev: 5,
    data: { ...scene, title: 'From server' },
    updatedAt: 100,
    deleted: false,
    ...over,
  });

  it('applies pulled records and tombstones', () => {
    let doc = docWith();
    doc = applyRecord(doc, rec());
    expect(doc.scenes.s1.title).toBe('From server');
    doc = applyRecord(doc, rec({ deleted: true }));
    expect(doc.scenes.s1).toBeUndefined();
  });

  it('docFromRecords rebuilds a whole document', () => {
    const doc = docFromRecords([
      rec({ id: 'p1', kind: 'project', parentId: null, data: project }),
      rec(),
    ]);
    expect(doc.projects.p1).toBeTruthy();
    expect(doc.scenes.s1).toBeTruthy();
  });

  it('safeToApply skips locally-dirty and conflicted ids', () => {
    expect(safeToApply(rec(), new Set(), new Set())).toBe(true);
    expect(safeToApply(rec(), new Set(['s1']), new Set())).toBe(false);
    expect(safeToApply(rec(), new Set(), new Set(['s1']))).toBe(false);
  });
});
