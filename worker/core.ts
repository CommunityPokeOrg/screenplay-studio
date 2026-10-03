/**
 * Pure sync-core for the Worker: optimistic-concurrency push semantics over an
 * ObjectStore, so the conflict logic is unit-testable without D1.
 */

export interface SyncObjectRow {
  user_id: string;
  project_id: string;
  id: string;
  kind: string;
  parent_id: string | null;
  rev: number;
  data: string;
  updated_at: number;
  deleted: number;
}

export interface PushChange {
  id: string;
  kind: string;
  projectId: string;
  parentId: string | null;
  /** Rev the client based its edit on; -1 = object must not exist yet. */
  baseRev: number;
  data: unknown;
  deleted: boolean;
}

export interface ObjectStore {
  get(userId: string, id: string): Promise<SyncObjectRow | undefined>;
  put(row: SyncObjectRow): Promise<void>;
  listSince(userId: string, since: number, limit: number): Promise<SyncObjectRow[]>;
}

export interface PushOutcome {
  applied: { id: string; rev: number }[];
  conflicts: {
    id: string;
    kind: string;
    projectId: string;
    parentId: string | null;
    rev: number;
    data: unknown;
    updatedAt: number;
    deleted: boolean;
  }[];
}

/**
 * Apply a batch of client changes. Each change is checked against the stored
 * rev: a match means the client had the latest server state and the write is
 * safe (rev increments); a mismatch means someone else wrote first — the change
 * is rejected and the server's current record is returned as a conflict for
 * the client to resolve.
 */
export async function applyPush(
  store: ObjectStore,
  userId: string,
  changes: PushChange[],
  now = Date.now(),
): Promise<PushOutcome> {
  const applied: PushOutcome['applied'] = [];
  const conflicts: PushOutcome['conflicts'] = [];

  for (const change of changes) {
    const row = await store.get(userId, change.id);

    if (!row) {
      if (change.baseRev >= 0) {
        // Client based an edit on an object the server no longer has (deleted
        // by another device, or never pushed). Surface a tombstone conflict.
        conflicts.push({
          id: change.id,
          kind: change.kind,
          projectId: change.projectId,
          parentId: change.parentId,
          rev: 0,
          data: null,
          updatedAt: now,
          deleted: true,
        });
        continue;
      }
      const rev = 1;
      await store.put({
        user_id: userId,
        project_id: change.projectId,
        id: change.id,
        kind: change.kind,
        parent_id: change.parentId,
        rev,
        data: JSON.stringify(change.data ?? null),
        updated_at: now,
        deleted: change.deleted ? 1 : 0,
      });
      applied.push({ id: change.id, rev });
      continue;
    }

    if (row.rev !== change.baseRev) {
      conflicts.push({
        id: row.id,
        kind: row.kind,
        projectId: row.project_id,
        parentId: row.parent_id,
        rev: row.rev,
        data: JSON.parse(row.data),
        updatedAt: row.updated_at,
        deleted: row.deleted === 1,
      });
      continue;
    }

    const rev = row.rev + 1;
    await store.put({
      ...row,
      project_id: change.projectId || row.project_id,
      kind: change.kind || row.kind,
      parent_id: change.parentId,
      rev,
      data: JSON.stringify(change.data ?? null),
      updated_at: now,
      deleted: change.deleted ? 1 : 0,
    });
    applied.push({ id: change.id, rev });
  }

  return { applied, conflicts };
}
