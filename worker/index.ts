import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { applyPush } from './core';
import type { ObjectStore, PushChange, SyncObjectRow } from './core';

interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  ASSETS: Fetcher;
  SYNC_TOKEN?: string;
}

type Vars = { userId: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', cors());

// Optional shared-secret gate: when SYNC_TOKEN is configured, every /api
// request must carry `Authorization: Bearer <token>`.
app.use('/api/*', async (c, next) => {
  if (c.env.SYNC_TOKEN) {
    const auth = c.req.header('authorization') ?? '';
    if (auth !== `Bearer ${c.env.SYNC_TOKEN}`) {
      return c.json({ error: 'unauthorized' }, 401);
    }
  }
  const userId = c.req.header('x-user-id');
  if (!userId || userId.length > 128) {
    return c.json({ error: 'missing x-user-id' }, 400);
  }
  c.set('userId', userId);
  await next();
});

class D1Store implements ObjectStore {
  constructor(private db: D1Database) {}

  async get(user: string, id: string) {
    const row = await this.db
      .prepare('SELECT * FROM objects WHERE user_id = ? AND id = ?')
      .bind(user, id)
      .first<SyncObjectRow>();
    return row ?? undefined;
  }

  async put(row: SyncObjectRow) {
    await this.db
      .prepare(
        `INSERT INTO objects (user_id, project_id, id, kind, parent_id, rev, data, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, id) DO UPDATE SET
           project_id = excluded.project_id,
           kind       = excluded.kind,
           parent_id  = excluded.parent_id,
           rev        = excluded.rev,
           data       = excluded.data,
           updated_at = excluded.updated_at,
           deleted    = excluded.deleted`,
      )
      .bind(
        row.user_id,
        row.project_id,
        row.id,
        row.kind,
        row.parent_id,
        row.rev,
        row.data,
        row.updated_at,
        row.deleted,
      )
      .run();
  }

  async listSince(user: string, since: number, limit: number) {
    const res = await this.db
      .prepare(
        'SELECT * FROM objects WHERE user_id = ? AND updated_at >= ? ORDER BY updated_at LIMIT ?',
      )
      .bind(user, since, limit)
      .all<SyncObjectRow>();
    return res.results;
  }
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/sync/push', async (c) => {
  const body = await c.req.json<{ changes?: PushChange[] }>();
  if (!Array.isArray(body.changes)) {
    return c.json({ error: 'changes must be an array' }, 400);
  }
  if (body.changes.length > 500) {
    return c.json({ error: 'too many changes (max 500)' }, 400);
  }
  const outcome = await applyPush(new D1Store(c.env.DB), c.var.userId, body.changes);
  return c.json(outcome);
});

app.get('/api/sync/pull', async (c) => {
  const since = Number(c.req.query('since') ?? '0') || 0;
  const rows = await new D1Store(c.env.DB).listSince(c.var.userId, Math.max(0, since - 1), 500);
  const records = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    projectId: r.project_id,
    parentId: r.parent_id,
    rev: r.rev,
    data: JSON.parse(r.data),
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
  }));
  const watermark = rows.reduce((m, r) => Math.max(m, r.updated_at), since);
  return c.json({ records, watermark });
});

/* ------------------------------ Attachments (R2) ------------------------------ */

const attKey = (user: string, project: string, id: string) => `${user}/${project}/${id}`;

interface AttachmentRow {
  id: string;
  project_id: string;
  name: string;
  size: number;
  content_type: string;
  created_at: number;
}

app.get('/api/attachments', async (c) => {
  const projectId = c.req.query('projectId');
  if (!projectId) return c.json({ error: 'projectId required' }, 400);
  const res = await c.env.DB.prepare(
    'SELECT id, project_id, name, size, content_type, created_at FROM attachments WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC',
  )
    .bind(c.var.userId, projectId)
    .all<AttachmentRow>();
  return c.json(
    res.results.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      size: r.size,
      contentType: r.content_type,
      createdAt: r.created_at,
    })),
  );
});

app.put('/api/attachments/:id', async (c) => {
  const projectId = c.req.query('projectId');
  const name = c.req.query('name') || 'file';
  if (!projectId) return c.json({ error: 'projectId required' }, 400);
  const id = c.req.param('id');
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 25 * 1024 * 1024) {
    return c.json({ error: 'file too large (max 25 MB)' }, 413);
  }
  const contentType = c.req.header('content-type') || 'application/octet-stream';
  const user = c.var.userId;
  await c.env.ATTACHMENTS.put(attKey(user, projectId, id), body, {
    httpMetadata: { contentType },
  });
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO attachments (user_id, project_id, id, name, size, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE SET
       name = excluded.name, size = excluded.size,
       content_type = excluded.content_type, created_at = excluded.created_at`,
  )
    .bind(user, projectId, id, name, body.byteLength, contentType, now)
    .run();
  return c.json({ id, projectId, name, size: body.byteLength, contentType, createdAt: now });
});

app.get('/api/attachments/:id', async (c) => {
  const projectId = c.req.query('projectId');
  if (!projectId) return c.json({ error: 'projectId required' }, 400);
  const obj = await c.env.ATTACHMENTS.get(attKey(c.var.userId, projectId, c.req.param('id')));
  if (!obj) return c.json({ error: 'not found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
});

app.delete('/api/attachments/:id', async (c) => {
  const projectId = c.req.query('projectId');
  if (!projectId) return c.json({ error: 'projectId required' }, 400);
  const id = c.req.param('id');
  const user = c.var.userId;
  await c.env.ATTACHMENTS.delete(attKey(user, projectId, id));
  await c.env.DB.prepare('DELETE FROM attachments WHERE user_id = ? AND id = ?')
    .bind(user, id)
    .run();
  return c.json({ ok: true });
});

// Everything else → the static frontend (SPA fallback handled by assets config).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
