import { uid } from '../lib/text';
import { useStore } from '../state/StoreContext';
import type { Episode, Scene, Series } from '../lib/types';

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { state, dispatch } = useStore();
  const { doc, selection } = state;
  const projects = Object.values(doc.projects).sort((a, b) => a.title.localeCompare(b.title));
  const project = selection.projectId ? doc.projects[selection.projectId] : undefined;

  const addProject = () => {
    const id = uid();
    dispatch({
      type: 'upsert',
      kind: 'project',
      entity: { id, title: 'Untitled Project', author: '', description: '' },
    });
    dispatch({ type: 'select', patch: { projectId: id, episodeId: null, sceneId: null } });
  };

  const addSeries = () => {
    if (!project) return;
    const order = Object.values(doc.series).filter((s) => s.projectId === project.id).length;
    const id = uid();
    dispatch({
      type: 'upsert',
      kind: 'series',
      entity: { id, projectId: project.id, title: `Season ${order + 1}`, order },
    });
  };

  const addEpisode = (series: Series) => {
    const eps = Object.values(doc.episodes).filter((e) => e.seriesId === series.id);
    const id = uid();
    dispatch({
      type: 'upsert',
      kind: 'episode',
      entity: {
        id,
        projectId: series.projectId,
        seriesId: series.id,
        number: Math.max(0, ...eps.map((e) => e.number)) + 1,
        title: '',
        order: eps.length,
      },
    });
    dispatch({ type: 'select', patch: { episodeId: id, sceneId: null } });
  };

  const addScene = (episode: Episode) => {
    const order = Object.values(doc.scenes).filter((s) => s.episodeId === episode.id).length;
    const id = uid();
    const scene: Scene = {
      id,
      projectId: episode.projectId,
      episodeId: episode.id,
      title: `Scene ${order + 1}`,
      order,
      synopsis: '',
      blocks: [{ id: uid(), type: 'scene-heading', text: 'INT. LOCATION - DAY' }],
    };
    dispatch({ type: 'upsert', kind: 'scene', entity: scene });
    dispatch({ type: 'select', patch: { episodeId: episode.id, sceneId: id } });
    dispatch({ type: 'setPanel', panel: 'script' });
    onNavigate();
  };

  const selectScene = (s: Scene) => {
    dispatch({ type: 'select', patch: { episodeId: s.episodeId, sceneId: s.id } });
    dispatch({ type: 'setPanel', panel: 'script' });
    onNavigate();
  };

  const selectEpisode = (e: Episode) => {
    dispatch({ type: 'select', patch: { episodeId: e.id, sceneId: null } });
    dispatch({ type: 'setPanel', panel: 'beats' });
    onNavigate();
  };

  const seriesList = project
    ? Object.values(doc.series).filter((s) => s.projectId === project.id).sort((a, b) => a.order - b.order)
    : [];

  return (
    <div className="flex h-full flex-col p-2 text-sm">
      {/* Project switcher */}
      <div className="mb-2 flex items-center gap-1">
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={selection.projectId ?? ''}
          onChange={(e) =>
            dispatch({
              type: 'select',
              patch: { projectId: e.target.value || null, episodeId: null, sceneId: null },
            })
          }
        >
          <option value="">— choose project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <IconBtn title="New project" onClick={addProject}>＋</IconBtn>
        {project && (
          <IconBtn
            title="Delete project"
            danger
            onClick={() => {
              if (confirm(`Delete project "${project.title}" and everything in it?`)) {
                dispatch({ type: 'remove', kind: 'project', id: project.id });
              }
            }}
          >
            🗑
          </IconBtn>
        )}
      </div>

      {project && (
        <>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase text-neutral-500">Outline</span>
            <button className="text-xs text-blue-600 hover:underline" onClick={addSeries}>
              + Series
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {seriesList.length === 0 && (
              <p className="px-1 text-xs text-neutral-500">
                No series yet — add one to start writing.
              </p>
            )}
            {seriesList.map((series) => {
              const episodes = Object.values(doc.episodes)
                .filter((e) => e.seriesId === series.id)
                .sort((a, b) => a.order - b.order);
              return (
                <section key={series.id} className="rounded border border-neutral-200 dark:border-neutral-800">
                  <header className="flex items-center gap-1 bg-neutral-50 px-2 py-1.5 dark:bg-neutral-800/60">
                    <input
                      className="min-w-0 flex-1 bg-transparent text-xs font-bold uppercase tracking-wide focus:outline-none"
                      value={series.title}
                      onChange={(e) =>
                        dispatch({
                          type: 'upsert',
                          kind: 'series',
                          entity: { ...series, title: e.target.value },
                        })
                      }
                    />
                    <IconBtn title="Add episode" onClick={() => addEpisode(series)}>＋</IconBtn>
                    <IconBtn
                      title="Delete series"
                      danger
                      onClick={() => {
                        if (confirm(`Delete "${series.title}" and its episodes?`)) {
                          dispatch({ type: 'remove', kind: 'series', id: series.id });
                        }
                      }}
                    >🗑</IconBtn>
                  </header>
                  {episodes.map((ep) => {
                    const scenes = Object.values(doc.scenes)
                      .filter((s) => s.episodeId === ep.id)
                      .sort((a, b) => a.order - b.order);
                    const epSelected = selection.episodeId === ep.id && !selection.sceneId;
                    return (
                      <div key={ep.id} className="border-t border-neutral-100 dark:border-neutral-800">
                        <div
                          className={`group flex cursor-pointer items-center gap-1 px-2 py-1.5 ${
                            epSelected ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                          }`}
                          onClick={() => selectEpisode(ep)}
                        >
                          <input
                            className="w-9 shrink-0 bg-transparent text-xs text-neutral-500 focus:outline-none"
                            value={ep.number}
                            title="Episode number"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              dispatch({
                                type: 'upsert',
                                kind: 'episode',
                                entity: { ...ep, number: Number(e.target.value) || 0 },
                              })
                            }
                          />
                          <input
                            className="min-w-0 flex-1 bg-transparent font-medium focus:outline-none"
                            placeholder={`Episode ${ep.number}`}
                            value={ep.title}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              dispatch({ type: 'upsert', kind: 'episode', entity: { ...ep, title: e.target.value } })
                            }
                          />
                          <IconBtn title="Add scene" onClick={(e) => { e.stopPropagation(); addScene(ep); }}>＋</IconBtn>
                          <IconBtn
                            title="Delete episode"
                            danger
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete episode ${ep.number}?`)) {
                                dispatch({ type: 'remove', kind: 'episode', id: ep.id });
                              }
                            }}
                          >🗑</IconBtn>
                        </div>
                        {scenes.map((scene, i) => (
                          <div
                            key={scene.id}
                            className={`group flex items-center gap-0.5 py-1 pl-6 pr-1 text-xs ${
                              selection.sceneId === scene.id
                                ? 'bg-blue-100 font-medium dark:bg-blue-950'
                                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                            }`}
                            onClick={() => selectScene(scene)}
                          >
                            <span className="min-w-0 flex-1 cursor-pointer truncate">
                              {scene.title || 'Untitled scene'}
                            </span>
                            <IconBtn
                              title="Move up"
                              disabled={i === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'moveScene', sceneId: scene.id, toIndex: i - 1 });
                              }}
                            >↑</IconBtn>
                            <IconBtn
                              title="Move down"
                              disabled={i === scenes.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'moveScene', sceneId: scene.id, toIndex: i + 1 });
                              }}
                            >↓</IconBtn>
                            <IconBtn
                              title="Delete scene"
                              danger
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this scene?')) {
                                  dispatch({ type: 'remove', kind: 'scene', id: scene.id });
                                }
                              }}
                            >🗑</IconBtn>
                          </div>
                        ))}
                        {scenes.length === 0 && (
                          <button
                            className="block w-full py-1 pl-6 text-left text-xs text-neutral-400 hover:text-blue-600"
                            onClick={() => addScene(ep)}
                          >
                            + first scene
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {episodes.length === 0 && (
                    <p className="px-2 py-1 text-xs text-neutral-400">No episodes.</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 rounded px-1 text-sm leading-5 ${
        danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}
