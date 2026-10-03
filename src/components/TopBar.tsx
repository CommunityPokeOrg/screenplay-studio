import { useEffect, useRef, useState } from 'react';
import { download, exportContent } from '../lib/export';
import type { ExportFormat, ExportScope } from '../lib/export';
import { useStore } from '../state/StoreContext';

const SYNC_LABEL: Record<string, string> = {
  idle: 'Not synced',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline',
  conflict: 'Conflicts',
  error: 'Sync error',
};

const SYNC_STYLE: Record<string, string> = {
  idle: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  syncing: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  synced: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  offline: 'bg-neutral-300 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  conflict: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: 'fountain', label: 'Fountain (.fountain)' },
  { id: 'pdf', label: 'PDF (.pdf)' },
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'txt', label: 'Plain text (.txt)' },
];

export default function TopBar() {
  const { state, dispatch, syncNow } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>('project');
  const menuRef = useRef<HTMLDivElement>(null);

  const project = state.selection.projectId
    ? state.doc.projects[state.selection.projectId]
    : undefined;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const doExport = async (format: ExportFormat) => {
    setExportOpen(false);
    if (!project) return;
    const episode = state.selection.episodeId ? state.doc.episodes[state.selection.episodeId] : undefined;
    const scene = state.selection.sceneId ? state.doc.scenes[state.selection.sceneId] : undefined;
    const result = await exportContent(format, scope, {
      project,
      seriesList: Object.values(state.doc.series).filter((s) => s.projectId === project.id),
      episodes: Object.values(state.doc.episodes).filter((e) => e.projectId === project.id),
      scenes: Object.values(state.doc.scenes).filter((s) => s.projectId === project.id),
      episode,
      scene,
    });
    download(result);
  };

  return (
    <header className="flex items-center gap-2 border-b border-neutral-300 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <span className="hidden text-sm font-bold tracking-tight sm:block">🎬 Screenplay Studio</span>
      {project ? (
        <input
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-neutral-300 focus:border-blue-400 focus:outline-none dark:hover:border-neutral-700"
          value={project.title}
          placeholder="Project title"
          onChange={(e) =>
            dispatch({ type: 'upsert', kind: 'project', entity: { ...project, title: e.target.value } })
          }
        />
      ) : (
        <span className="flex-1 text-sm text-neutral-500">No project selected</span>
      )}

      <button
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${SYNC_STYLE[state.syncStatus]}`}
        title={state.syncError ?? 'Click to sync now'}
        onClick={() => void syncNow()}
      >
        {SYNC_LABEL[state.syncStatus]}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          disabled={!project}
          onClick={() => setExportOpen((v) => !v)}
        >
          Export ▾
        </button>
        {exportOpen && (
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-neutral-300 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-2 flex gap-1 text-xs">
              {(['project', 'episode', 'scene'] as ExportScope[]).map((s) => (
                <button
                  key={s}
                  className={`rounded px-2 py-1 capitalize ${
                    scope === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                  onClick={() => setScope(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => void doExport(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
