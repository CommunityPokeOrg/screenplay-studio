import { uid } from './text';
import type { Doc } from './types';

/** A small starter project so a fresh install isn't an empty screen. */
export function seedDoc(): Doc {
  const projectId = uid();
  const seriesId = uid();
  const episodeId = uid();
  const sceneId = uid();
  const charId = uid();
  const beatId = uid();
  const ideaId = uid();

  return {
    projects: {
      [projectId]: {
        id: projectId,
        title: 'The Last Lighthouse',
        author: '',
        description: 'A keepers\' daughter fights to keep the light burning.',
      },
    },
    series: {
      [seriesId]: { id: seriesId, projectId, title: 'Season One', order: 0 },
    },
    episodes: {
      [episodeId]: {
        id: episodeId,
        projectId,
        seriesId,
        number: 1,
        title: 'Storm Warning',
        order: 0,
      },
    },
    scenes: {
      [sceneId]: {
        id: sceneId,
        projectId,
        episodeId,
        title: 'The lamp room',
        order: 0,
        synopsis: 'Mara refuses to abandon the light.',
        blocks: [
          { id: uid(), type: 'scene-heading', text: 'INT. LIGHTHOUSE - LAMP ROOM - NIGHT' },
          { id: uid(), type: 'action', text: 'Wind rattles the glass. MARA (17) trims the wick with steady hands.' },
          { id: uid(), type: 'character', text: 'MARA' },
          { id: uid(), type: 'parenthetical', text: '(to the storm)' },
          { id: uid(), type: 'dialogue', text: 'Not tonight.' },
          { id: uid(), type: 'transition', text: 'CUT TO:' },
        ],
      },
    },
    characters: {
      [charId]: {
        id: charId,
        projectId,
        name: 'Mara',
        description: 'Seventeen, stubborn, keeper-in-training.',
        notes: '',
      },
    },
    beats: {
      [beatId]: {
        id: beatId,
        projectId,
        episodeId,
        act: 'Act 1',
        title: 'The storm arrives',
        description: 'A storm knocks out the supply boat; Mara keeps the lamp lit alone.',
        order: 0,
      },
    },
    ideas: {
      [ideaId]: {
        id: ideaId,
        projectId,
        text: 'The lighthouse lens is a found-object telescope — who built it?',
        tags: ['mystery'],
        createdAt: Date.now(),
      },
    },
  };
}
