# Screenplay Studio

A production-grade screenplay writing web app. React + Vite + TypeScript + Tailwind
on the front, a Cloudflare Worker with a D1 relational database and R2 object
storage on the back.

**No AI.** There are no AI features, integrations, SDKs, or API calls anywhere in
this codebase — it's a writing tool, not a generator.

## Features

- **Project hierarchy** — projects → series → episodes → **reorderable scenes**,
  all editable from the outline sidebar.
- **Screenplay-native block editor** — every paragraph is a typed element:
  scene heading, action, character, parenthetical, dialogue, transition,
  centered, note. Blocks can never contain a newline, so a character →
  (parenthetical) → dialogue group **cannot contain a blank line** — the editor
  also validates and auto-fixes any stray blank lines inside a dialogue block.
- **Exports** — Fountain (`.fountain`), PDF (screenplay layout, Courier 12pt,
  US Letter), Word (`.docx`), and plain text (`.txt`), for the whole project,
  one episode, or one scene.
- **Cloud sync** — automatic sync to a Cloudflare Worker + D1. Edits push every
  few seconds and on `Ctrl+S`; everything also **debounced-backs-up to IndexedDB**
  so the app works fully offline.
- **Concurrent-edit conflict detection** — every object carries a revision
  (`rev`); the server rejects writes based on a stale rev and the client offers
  "keep mine / take server" resolution.
- **Beat sheet → scenes** — write the episode's beats first, then convert them
  into ordered scenes with one click.
- **Character profiles** and an **idea bank** per project.
- **Attachments** — reference files stored in Cloudflare R2.
- **Mobile-first + desktop keyboard flow** — responsive layout with bottom-nav on
  phones; on desktop, Enter/Tab/arrow-key flow that never leaves the keyboard.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Enter` | New element (type follows screenplay conventions: character → dialogue → action…) |
| `Enter` on empty element | Cycle element type instead of creating blank lines |
| `Tab` / `Shift+Tab` | Cycle element type forward / back |
| `Ctrl`/`Cmd` + `1–8` | Set element type directly |
| `Backspace` on empty | Delete element |
| `↑` / `↓` at edges | Move between elements |
| `Ctrl`/`Cmd` + `S` | Sync now |

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  React SPA (Vite build →    │  /api   │  Cloudflare Worker (Hono)        │
│  served as Worker assets)   ├────────►│  ├─ POST /api/sync/push           │
│  IndexedDB local backup     │         │  ├─ GET  /api/sync/pull           │
└─────────────────────────────┘         │  ├─ PUT/GET/DELETE /api/attachments│
                                        │  D1: objects (rev'd entities)    │
                                        │      attachments (metadata)      │
                                        │  R2: attachment blobs            │
                                        └──────────────────────────────────┘
```

- `src/` — frontend (React 19, Tailwind 4)
- `worker/` — Worker API (`index.ts`) + dependency-free sync core (`core.ts`)
- `migrations/` — D1 schema (`0001_init.sql`)
- `tests/` — Vitest unit tests (editor rules, Fountain/text export, sync
  conflict logic, beat conversion)
- `wrangler.toml` — assets + D1 + R2 bindings

### Sync protocol

Every entity is a row in `objects` with a monotonically increasing `rev`.

- **Push** `POST /api/sync/push {changes:[{id, baseRev, data, deleted, …}]}` —
  the worker applies a change only when `baseRev == stored rev` (new objects use
  `baseRev: -1`), else returns the stored record as a **conflict**.
- **Pull** `GET /api/sync/pull?since=<watermark>` — returns records updated at or
  after the watermark; the client applies them unless it has local unsent edits
  for the same object.
- **Auth** — requests are namespaced by an `x-user-id` header (device-generated,
  stored in `localStorage`). Set the `SYNC_TOKEN` worker secret to additionally
  require `Authorization: Bearer <token>`.

## Local development

```bash
npm install

# Terminal 1 — API on :8787 (uses local D1/R2 emulation)
npx wrangler d1 migrations apply screenplay-studio --local
npm run worker:dev

# Terminal 2 — frontend on :5173 (proxies /api to the worker)
npm run dev
```

## Tests & build

```bash
npm test        # vitest
npm run build   # tsc project references + vite build → dist/
```

CI runs both on `macos-latest` (`.github/workflows/ci.yml`).

## Deploy to Cloudflare

```bash
# 1. Create resources (once)
wrangler login
wrangler d1 create screenplay-studio            # → paste database_id into wrangler.toml
wrangler r2 bucket create screenplay-attachments

# 2. Apply the schema
npm run db:migrate

# 3. (optional) require a shared token for the API
wrangler secret put SYNC_TOKEN
#    and store the same value in the browser: localStorage['ss-sync-token'] = '…'

# 4. Build + deploy
npm run deploy
```

The Worker serves the built SPA from `dist/`; any non-`/api` route falls back to
`index.html` (SPA mode).
