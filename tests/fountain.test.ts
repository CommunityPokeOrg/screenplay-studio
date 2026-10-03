import { describe, expect, it } from 'vitest';
import { episodeToFountain, projectToFountain, sceneToFountain } from '../src/lib/fountain';
import { sceneToText } from '../src/lib/txt';
import type { Block, ElementType } from '../src/lib/types';

let n = 0;
const b = (type: ElementType, text: string): Block => ({ id: `b${n++}`, type, text });

const scene = {
  id: 's1',
  projectId: 'p1',
  episodeId: 'e1',
  title: 'Lamp room',
  order: 0,
  synopsis: '',
  blocks: [
    b('scene-heading', 'INT. LIGHTHOUSE - NIGHT'),
    b('action', 'Wind rattles the glass.'),
    b('character', 'MARA'),
    b('parenthetical', '(to the storm)'),
    b('dialogue', 'Not tonight.'),
    b('character', 'FINN'),
    b('dialogue', 'Mara, come down.'),
    b('transition', 'CUT TO:'),
  ],
};

describe('sceneToFountain', () => {
  const out = sceneToFountain(scene);

  it('emits scene heading, action, character, parenthetical, dialogue', () => {
    expect(out).toContain('INT. LIGHTHOUSE - NIGHT');
    expect(out).toContain('Wind rattles the glass.');
    expect(out).toContain('MARA');
    expect(out).toContain('(to the storm)');
    expect(out).toContain('Not tonight.');
  });

  it('keeps no blank lines inside a dialogue group', () => {
    expect(out).toContain('MARA\n(to the storm)\nNot tonight.');
  });

  it('separates two character groups with a blank line', () => {
    expect(out).toContain('Not tonight.\n\nFINN');
  });

  it('separates other elements with blank lines', () => {
    expect(out).toContain('INT. LIGHTHOUSE - NIGHT\n\nWind rattles the glass.');
  });

  it('forces a scene heading for non-INT/EXT text', () => {
    const s = { ...scene, blocks: [b('scene-heading', 'Lighthouse lamp room')] };
    expect(sceneToFountain(s)).toBe('.LIGHTHOUSE LAMP ROOM');
  });
});

describe('sceneToText', () => {
  const out = sceneToText(scene);
  it('indents the character cue', () => {
    expect(out).toContain('                      MARA');
  });
  it('indents dialogue less than the cue', () => {
    expect(out).toContain('          Not tonight.');
  });
  it('right-aligns the transition', () => {
    const line = out.split('\n').find((l) => l.includes('CUT TO:'))!;
    expect(line.startsWith(' ')).toBe(true);
  });
});

describe('episodeToFountain / projectToFountain', () => {
  const episode = { id: 'e1', projectId: 'p1', seriesId: 'se1', number: 1, title: 'Storm', order: 0 };
  const series = { id: 'se1', projectId: 'p1', title: 'Season One', order: 0 };
  const project = { id: 'p1', title: 'The Last Lighthouse', author: 'A. Writer', description: '' };

  it('emits the episode section header', () => {
    expect(episodeToFountain(episode, [scene], 2)).toContain('## EPISODE 1 — Storm');
  });

  it('emits a title page and series header for the whole project', () => {
    const out = projectToFountain(project, [series], [episode], [scene]);
    expect(out).toContain('Title: The Last Lighthouse');
    expect(out).toContain('Author: A. Writer');
    expect(out).toContain('# SEASON ONE');
  });
});
