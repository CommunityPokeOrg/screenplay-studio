import type { Beat, Episode, Scene } from './types';

/**
 * Convert a beat sheet into ordered scenes for an episode. Each beat becomes
 * one scene: the beat title seeds the scene title/heading placeholder and the
 * beat description becomes the opening action block (and the scene synopsis).
 */
export function beatsToScenes(
  beats: Beat[],
  episode: Episode,
  startOrder: number,
  makeId: () => string,
): Scene[] {
  return [...beats]
    .sort((a, b) => a.order - b.order)
    .map((beat, i) => ({
      id: makeId(),
      projectId: episode.projectId,
      episodeId: episode.id,
      title: beat.title,
      order: startOrder + i,
      synopsis: beat.description,
      blocks: [
        {
          id: makeId(),
          type: 'scene-heading' as const,
          text: 'INT. LOCATION - DAY',
        },
        ...(beat.description.trim()
          ? [{ id: makeId(), type: 'action' as const, text: beat.description }]
          : []),
      ],
    }));
}
