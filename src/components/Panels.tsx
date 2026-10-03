import { useCallback, useEffect, useState } from 'react';
import { beatsToScenes } from '../lib/beats';
import { uid } from '../lib/text';
import type { AttachmentMeta, Beat, CharacterProfile, Idea } from '../lib/types';
import { useStore } from '../state/StoreContext';

function PanelShell({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900';

/* ------------------------------ Beats ------------------------------ */

export function BeatsPanel() {
  const { state, dispatch } = useStore();
  const { doc, selection } = state;
  const episode = selection.episodeId ? doc.episodes[selection.episodeId] : undefined;

  if (!episode) {
    return (
      <PanelShell title="Beat sheet">
        <p className="text-sm text-neutral-500">Select an episode in the outline first.</p>
      </PanelShell>
    );
  }

  const beats = Object.values(doc.beats)
    .filter((b) => b.episodeId === episode.id)
    .sort((a, b) => a.order - b.order);

  const addBeat = () => {
    const beat: Beat = {
      id: uid(),
      projectId: episode.projectId,
      episodeId: episode.id,
      act: '',
      title: '',
      description: '',
      order: beats.length,
    };
    dispatch({ type: 'upsert', kind: 'beat', entity: beat });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= beats.length) return;
    dispatch({ type: 'upsert', kind: 'beat', entity: { ...beats[i], order: j } });
    dispatch({ type: 'upsert', kind: 'beat', entity: { ...beats[j], order: i } });
  };

  const convert = () => {
    if (!beats.length) return;
    if (!confirm(`Convert ${beats.length} beat${beats.length > 1 ? 's' : ''} into scenes?`)) return;
    const existing = Object.values(doc.scenes).filter((s) => s.episodeId === episode.id).length;
    const scenes = beatsToScenes(beats, episode, existing, uid);
    for (const s of scenes) dispatch({ type: 'upsert', kind: 'scene', entity: s });
    dispatch({ type: 'select', patch: { sceneId: scenes[0]?.id ?? null } });
    dispatch({ type: 'setPanel', panel: 'script' });
  };

  return (
    <PanelShell
      title={`Beat sheet — Episode ${episode.number}${episode.title ? ': ' + episode.title : ''}`}
      actions={
        <>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={addBeat}>
            + Beat
          </button>
          <button
            className="rounded border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 disabled:opacity-40"
            disabled={!beats.length}
            onClick={convert}
          >
            Convert to scenes
          </button>
        </>
      }
    >
      {beats.length === 0 && (
        <p className="text-sm text-neutral-500">
          No beats yet. Beats are the story steps of this episode — convert them to scenes when
          you're ready to write pages.
        </p>
      )}
      <div className="space-y-2">
        {beats.map((beat, i) => (
          <div key={beat.id} className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex gap-2">
              <input
                className={`${inputCls} w-24`}
                placeholder="Act"
                value={beat.act}
                onChange={(e) => dispatch({ type: 'upsert', kind: 'beat', entity: { ...beat, act: e.target.value } })}
              />
              <input
                className={inputCls}
                placeholder="Beat title"
                value={beat.title}
                onChange={(e) => dispatch({ type: 'upsert', kind: 'beat', entity: { ...beat, title: e.target.value } })}
              />
              <span className="flex shrink-0 items-center gap-0.5 text-xs text-neutral-400">
                <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === beats.length - 1}>↓</button>
                <button
                  className="text-red-500"
                  onClick={() => dispatch({ type: 'remove', kind: 'beat', id: beat.id })}
                >
                  ✕
                </button>
              </span>
            </div>
            <textarea
              className={`${inputCls} mt-2`}
              rows={2}
              placeholder="What happens in this beat?"
              value={beat.description}
              onChange={(e) =>
                dispatch({ type: 'upsert', kind: 'beat', entity: { ...beat, description: e.target.value } })
              }
            />
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ---------------------------- Characters ---------------------------- */

export function CharactersPanel() {
  const { state, dispatch } = useStore();
  const projectId = state.selection.projectId;
  const characters = Object.values(state.doc.characters)
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const add = () => {
    if (!projectId) return;
    const c: CharacterProfile = { id: uid(), projectId, name: '', description: '', notes: '' };
    dispatch({ type: 'upsert', kind: 'character', entity: c });
  };

  return (
    <PanelShell
      title="Characters"
      actions={
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          disabled={!projectId}
          onClick={add}
        >
          + Character
        </button>
      }
    >
      {!projectId && <p className="text-sm text-neutral-500">Select a project first.</p>}
      {projectId && characters.length === 0 && (
        <p className="text-sm text-neutral-500">No character profiles yet.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {characters.map((c) => (
          <div key={c.id} className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-start gap-2">
              <input
                className={`${inputCls} font-semibold uppercase`}
                placeholder="NAME"
                value={c.name}
                onChange={(e) =>
                  dispatch({ type: 'upsert', kind: 'character', entity: { ...c, name: e.target.value.toUpperCase() } })
                }
              />
              <button
                className="text-xs text-red-500"
                title="Delete character"
                onClick={() => dispatch({ type: 'remove', kind: 'character', id: c.id })}
              >
                ✕
              </button>
            </div>
            <textarea
              className={`${inputCls} mt-2`}
              rows={2}
              placeholder="Description"
              value={c.description}
              onChange={(e) =>
                dispatch({ type: 'upsert', kind: 'character', entity: { ...c, description: e.target.value } })
              }
            />
            <textarea
              className={`${inputCls} mt-2 text-xs`}
              rows={2}
              placeholder="Private notes"
              value={c.notes}
              onChange={(e) => dispatch({ type: 'upsert', kind: 'character', entity: { ...c, notes: e.target.value } })}
            />
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------- Ideas ------------------------------ */

export function IdeasPanel() {
  const { state, dispatch } = useStore();
  const projectId = state.selection.projectId;
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');

  const ideas = Object.values(state.doc.ideas)
    .filter((i) => i.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);

  const add = () => {
    if (!projectId || !text.trim()) return;
    const idea: Idea = {
      id: uid(),
      projectId,
      text: text.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: Date.now(),
    };
    dispatch({ type: 'upsert', kind: 'idea', entity: idea });
    setText('');
    setTags('');
  };

  return (
    <PanelShell title="Idea bank">
      {!projectId && <p className="text-sm text-neutral-500">Select a project first.</p>}
      {projectId && (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={inputCls}
              placeholder="An idea, image, line of dialogue…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <input
              className={`${inputCls} sm:w-48`}
              placeholder="tags, comma separated"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={add}>
              Save
            </button>
          </div>
          <ul className="space-y-2">
            {ideas.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <p>{i.text}</p>
                  {i.tags.length > 0 && (
                    <p className="mt-1 text-xs text-blue-600">{i.tags.map((t) => `#${t}`).join(' ')}</p>
                  )}
                </div>
                <button
                  className="text-xs text-red-500"
                  onClick={() => dispatch({ type: 'remove', kind: 'idea', id: i.id })}
                >
                  ✕
                </button>
              </li>
            ))}
            {ideas.length === 0 && <li className="text-sm text-neutral-500">Nothing here yet.</li>}
          </ul>
        </>
      )}
    </PanelShell>
  );
}

/* ---------------------------- Attachments --------------------------- */

export function FilesPanel() {
  const { state, userId } = useStore();
  const projectId = state.selection.projectId;
  const [files, setFiles] = useState<AttachmentMeta[]>([]);
  const [status, setStatus] = useState<string>('');

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'x-user-id': userId };
    const token = localStorage.getItem('ss-sync-token');
    if (token) h['authorization'] = `Bearer ${token}`;
    return h;
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/attachments?projectId=${projectId}`, { headers: headers() });
      if (!res.ok) throw new Error(`${res.status}`);
      setFiles(await res.json());
      setStatus('');
    } catch (e) {
      setStatus(`Attachments unavailable (${e}) — is the Worker running?`);
    }
  }, [projectId, headers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (fileList: FileList | null) => {
    if (!fileList || !projectId) return;
    for (const file of Array.from(fileList)) {
      const id = uid();
      const res = await fetch(`/api/attachments/${id}?projectId=${projectId}&name=${encodeURIComponent(file.name)}`, {
        method: 'PUT',
        headers: { ...headers(), 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) setStatus(`Upload failed for ${file.name}: ${res.status}`);
    }
    void refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/attachments/${id}?projectId=${projectId}`, { method: 'DELETE', headers: headers() });
    void refresh();
  };

  return (
    <PanelShell title="Files & attachments">
      {!projectId && <p className="text-sm text-neutral-500">Select a project first.</p>}
      {projectId && (
        <>
          <label className="mb-3 inline-block cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
            Upload files
            <input type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          </label>
          {status && <p className="mb-2 text-xs text-amber-600">{status}</p>}
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
                <a className="min-w-0 flex-1 truncate text-blue-600 hover:underline" href={`/api/attachments/${f.id}?projectId=${projectId}`} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                <span className="text-xs text-neutral-400">{(f.size / 1024).toFixed(1)} KB</span>
                <button className="text-xs text-red-500" onClick={() => void remove(f.id)}>✕</button>
              </li>
            ))}
            {files.length === 0 && !status && (
              <li className="text-sm text-neutral-500">No attachments yet.</li>
            )}
          </ul>
        </>
      )}
    </PanelShell>
  );
}
