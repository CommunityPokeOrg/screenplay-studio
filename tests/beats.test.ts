import { describe, expect, it } from 'vitest';
import { beatsToScenes } from '../src/lib/beats';
import type { Beat, Episode } from '../src/lib/types';

let n = 0;
const makeId = () => `id${n++}`;

const episode: Episode = { id: 'e1', projectId: 'p1', seriesId: 'se1', number: 1, title: 'Pilot', order: 0 };

const beats: Beat[] = [
  { id: 'b2', projectId: 'p1', episodeId: 'e1', act: '2', title: 'The flood', description: 'Water reaches the lamp room.', order: 1 },
  { id: 'b1', projectId: 'p1', episodeId: 'e1', act: '1', title: 'Storm hits', description: 'The supply boat capsizes.', order: 0 },
];

describe('beatsToScenes', () => {
  it('creates one scene per beat, in beat order, starting at startOrder', () => {
    const scenes = beatsToScenes(beats, episode, 5, makeId);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].title).toBe('Storm hits');
    expect(scenes[1].title).toBe('The flood');
    expect(scenes.map((s) => s.order)).toEqual([5, 6]);
  });

  it('seeds each scene with a heading and the beat description as action', () => {
    const scenes = beatsToScenes(beats, episode, 0, makeId);
    expect(scenes[0].blocks[0].type).toBe('scene-heading');
    expect(scenes[0].blocks[1].type).toBe('action');
    expect(scenes[0].blocks[1].text).toBe('The supply boat capsizes.');
    expect(scenes[0].synopsis).toBe('The supply boat capsizes.');
    expect(scenes[0].episodeId).toBe('e1');
    expect(scenes[0].projectId).toBe('p1');
  });
});
