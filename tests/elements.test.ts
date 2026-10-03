import { describe, expect, it } from 'vitest';
import {
  nextElement,
  nextElementFor,
  normalizeBlocks,
  validateBlocks,
} from '../src/lib/elements';
import type { Block, ElementType } from '../src/lib/types';

let n = 0;
const b = (type: ElementType, text: string): Block => ({ id: `b${n++}`, type, text });

describe('nextElement (Tab cycling)', () => {
  it('cycles forward and wraps', () => {
    expect(nextElement('scene-heading')).toBe('action');
    expect(nextElement('note')).toBe('scene-heading');
  });
  it('cycles backward and wraps', () => {
    expect(nextElement('scene-heading', -1)).toBe('note');
    expect(nextElement('action', -1)).toBe('scene-heading');
  });
});

describe('nextElementFor (Enter)', () => {
  it('character → dialogue → action', () => {
    expect(nextElementFor('character')).toBe('dialogue');
    expect(nextElementFor('parenthetical')).toBe('dialogue');
    expect(nextElementFor('dialogue')).toBe('action');
    expect(nextElementFor('transition')).toBe('scene-heading');
  });
});

describe('validateBlocks — no blank lines in dialogue groups', () => {
  it('flags an empty block inside a character group', () => {
    const blocks = [
      b('character', 'MARA'),
      b('action', ''), // blank line inside the group
      b('dialogue', 'Not tonight.'),
    ];
    const issues = validateBlocks(blocks);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('Blank line'))).toBe(true);
  });

  it('flags empty group-typed blocks', () => {
    const issues = validateBlocks([b('dialogue', '')]);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('accepts a clean character group', () => {
    const blocks = [
      b('character', 'MARA'),
      b('parenthetical', '(to the storm)'),
      b('dialogue', 'Not tonight.'),
      b('action', 'She turns the wick.'),
    ];
    expect(validateBlocks(blocks).filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('warns on parenthetical without a character cue', () => {
    const issues = validateBlocks([b('action', 'Rain.'), b('parenthetical', '(quietly)')]);
    expect(issues.some((i) => i.message.includes('Parenthetical'))).toBe(true);
  });
});

describe('normalizeBlocks', () => {
  it('removes blank lines inside dialogue groups', () => {
    const blocks = [
      b('character', 'MARA'),
      b('action', '   '), // whitespace-only blank inside group
      b('dialogue', 'Not tonight.'),
    ];
    const out = normalizeBlocks(blocks);
    expect(out).toHaveLength(2);
    expect(out[1].type).toBe('dialogue');
  });

  it('uppercases scene headings, characters and transitions', () => {
    const out = normalizeBlocks([
      b('scene-heading', 'int. lighthouse - night'),
      b('character', 'mara'),
      b('transition', 'cut to:'),
    ]);
    expect(out.map((x) => x.text)).toEqual([
      'INT. LIGHTHOUSE - NIGHT',
      'MARA',
      'CUT TO:',
    ]);
  });

  it('wraps bare parentheticals', () => {
    const out = normalizeBlocks([b('parenthetical', 'quietly')]);
    expect(out[0].text).toBe('(quietly)');
  });
});
