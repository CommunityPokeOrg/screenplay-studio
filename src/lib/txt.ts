import { isDialogueGroupType, normalizeBlocks } from './elements';
import { center, wrap } from './text';
import type { Block, Episode, Project, Scene, Series } from './types';

export const PAGE_WIDTH = 60; // characters of Courier on a screenplay line

const WIDTHS: Record<Block['type'], number> = {
  'scene-heading': 60,
  action: 60,
  character: 36,
  parenthetical: 30,
  dialogue: 36,
  transition: 60,
  centered: 60,
  note: 60,
};

const INDENTS: Record<Block['type'], number> = {
  'scene-heading': 0,
  action: 0,
  character: 22,
  parenthetical: 16,
  dialogue: 10,
  transition: 0,
  centered: 0,
  note: 0,
};

function blockLines(b: Block): string[] {
  const w = WIDTHS[b.type];
  const indent = ' '.repeat(INDENTS[b.type]);
  if (b.type === 'transition') {
    return [b.text.padStart(PAGE_WIDTH)];
  }
  if (b.type === 'centered') {
    return wrap(b.text, w).map((l) => center(l, PAGE_WIDTH));
  }
  if (b.type === 'note') {
    return wrap(`[[ ${b.text} ]]`, w).map((l) => indent + l);
  }
  return wrap(b.text, w).map((l) => indent + l);
}

/** Plain-text screenplay layout with screenplay element indents. */
export function sceneToText(scene: Scene): string {
  const blocks = normalizeBlocks(scene.blocks);
  const lines: string[] = [];
  let prev: Block | undefined;
  for (const b of blocks) {
    const needsBlank =
      lines.length > 0 &&
      !(prev && isDialogueGroupType(prev.type) && (b.type === 'parenthetical' || b.type === 'dialogue'));
    if (needsBlank) lines.push('');
    lines.push(...blockLines(b));
    prev = b;
  }
  return lines.join('\n');
}

export function episodeToText(episode: Episode, scenes: Scene[]): string {
  const head = `EPISODE ${episode.number}${episode.title ? ' — ' + episode.title : ''}`;
  const parts = [head, '='.repeat(head.length)];
  for (const s of scenes) {
    const t = sceneToText(s);
    if (t.trim()) parts.push(t);
  }
  return parts.join('\n\n');
}

export function projectToText(
  project: Project,
  seriesList: Series[],
  episodes: Episode[],
  scenes: Scene[],
): string {
  const parts: string[] = [
    `${project.title.toUpperCase()}\n\nwritten by\n\n${project.author}`,
  ];
  for (const series of [...seriesList].sort((a, b) => a.order - b.order)) {
    const eps = episodes
      .filter((e) => e.seriesId === series.id)
      .sort((a, b) => a.order - b.order);
    if (eps.length === 0) continue;
    const title = series.title.toUpperCase();
    const section = [title, '-'.repeat(title.length)];
    for (const ep of eps) {
      const epScenes = scenes
        .filter((s) => s.episodeId === ep.id)
        .sort((a, b) => a.order - b.order);
      section.push(episodeToText(ep, epScenes));
    }
    parts.push(section.join('\n\n'));
  }
  return parts.join('\n\n\n') + '\n';
}
