import { projectToFountain } from './fountain';
import { slug } from './text';
import { episodeToText, projectToText, sceneToText } from './txt';
import { normalizeBlocks } from './elements';
import { episodeToFountain, sceneToFountain } from './fountain';
import type { Episode, Project, Scene, Series } from './types';

export type ExportFormat = 'fountain' | 'txt' | 'pdf' | 'docx';
export type ExportScope = 'project' | 'episode' | 'scene';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export async function exportContent(
  format: ExportFormat,
  scope: ExportScope,
  ctx: {
    project: Project;
    seriesList: Series[];
    episodes: Episode[];
    scenes: Scene[];
    episode?: Episode;
    scene?: Scene;
  },
): Promise<ExportResult> {
  const { project, seriesList, episodes, scenes, episode, scene } = ctx;
  const base = slug(scope === 'scene' && scene ? scene.title : scope === 'episode' && episode ? `ep-${episode.number}-${episode.title}` : project.title);

  if (format === 'fountain') {
    const text =
      scope === 'scene' && scene
        ? sceneToFountain({ ...scene, blocks: normalizeBlocks(scene.blocks) }) + '\n'
        : scope === 'episode' && episode
          ? episodeToFountain(episode, scenes.filter((s) => s.episodeId === episode.id).sort((a, b) => a.order - b.order), 1) + '\n'
          : projectToFountain(project, seriesList, episodes, scenes);
    return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: `${base}.fountain` };
  }
  if (format === 'txt') {
    const text =
      scope === 'scene' && scene
        ? sceneToText(scene) + '\n'
        : scope === 'episode' && episode
          ? episodeToText(episode, scenes.filter((s) => s.episodeId === episode.id).sort((a, b) => a.order - b.order)) + '\n'
          : projectToText(project, seriesList, episodes, scenes);
    return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
  }
  if (format === 'pdf') {
    const { exportPdf } = await import('./pdf');
    const blob = exportPdf(project, seriesList, episodes, scenes, {
      episodeId: scope === 'episode' ? episode?.id : undefined,
    });
    return { blob, filename: `${base}.pdf` };
  }
  const { exportDocx } = await import('./docx');
  const blob = await exportDocx(project, seriesList, episodes, scenes, {
    episodeId: scope === 'episode' ? episode?.id : undefined,
  });
  return { blob, filename: `${base}.docx` };
}

export function download(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
