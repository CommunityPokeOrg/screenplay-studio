import { isDialogueGroupType, normalizeBlocks } from './elements';
import type { Block, Episode, Project, Scene, Series } from './types';

const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/?EXT|I\/E)[\s.]/i;

function blockLines(b: Block): string[] {
  switch (b.type) {
    case 'scene-heading': {
      const t = b.text.replace(/^\.+\s*/, '');
      return SCENE_HEADING_RE.test(t) ? [t] : ['.' + t];
    }
    case 'action':
      return [b.text];
    case 'character':
      return [b.text];
    case 'parenthetical':
      return [b.text];
    case 'dialogue':
      return [b.text];
    case 'transition':
      return b.text.endsWith('TO:') || b.text.endsWith(':') ? [b.text] : ['> ' + b.text];
    case 'centered':
      return ['> ' + b.text + ' <'];
    case 'note':
      return ['[[ ' + b.text + ' ]]'];
  }
}

/**
 * Serialize a scene to Fountain. Blocks inside a character/dialogue group are
 * contiguous (blank lines would end the character element); every other
 * element is separated by exactly one blank line.
 */
export function sceneToFountain(scene: Scene): string {
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

export function episodeToFountain(
  episode: Episode,
  scenes: Scene[],
  sectionDepth: number,
): string {
  const marker = '#'.repeat(Math.min(6, Math.max(1, sectionDepth)));
  const parts = [`${marker} EPISODE ${episode.number}${episode.title ? ' — ' + episode.title : ''}`];
  for (const s of scenes) {
    const f = sceneToFountain(s);
    if (f.trim()) parts.push(f);
  }
  return parts.join('\n\n');
}

export function projectToFountain(
  project: Project,
  seriesList: Series[],
  episodes: Episode[],
  scenes: Scene[],
): string {
  const parts: string[] = [
    [
      `Title: ${project.title}`,
      `Credit: Written by`,
      `Author: ${project.author}`,
    ].join('\n'),
  ];
  const sortedSeries = [...seriesList].sort((a, b) => a.order - b.order);
  for (const series of sortedSeries) {
    const seriesEpisodes = episodes
      .filter((e) => e.seriesId === series.id)
      .sort((a, b) => a.order - b.order);
    if (seriesEpisodes.length === 0) continue;
    const section = [`# ${series.title.toUpperCase()}`];
    for (const ep of seriesEpisodes) {
      const epScenes = scenes
        .filter((s) => s.episodeId === ep.id)
        .sort((a, b) => a.order - b.order);
      section.push(episodeToFountain(ep, epScenes, 2));
    }
    parts.push(section.join('\n\n'));
  }
  return parts.join('\n\n') + '\n';
}
