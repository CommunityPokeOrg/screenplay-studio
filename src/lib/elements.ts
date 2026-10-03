import type { Block, ElementType } from './types';

export const ELEMENT_CYCLE: readonly ElementType[] = [
  'scene-heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'centered',
  'note',
];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  'scene-heading': 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  centered: 'Centered',
  note: 'Note',
};

export const ELEMENT_SHORTCUT: Record<ElementType, string> = {
  'scene-heading': '1',
  action: '2',
  character: '3',
  parenthetical: '4',
  dialogue: '5',
  transition: '6',
  centered: '7',
  note: '8',
};

const DIALOGUE_GROUP: ReadonlySet<ElementType> = new Set([
  'character',
  'parenthetical',
  'dialogue',
]);

export function isDialogueGroupType(t: ElementType): boolean {
  return DIALOGUE_GROUP.has(t);
}

/** Cycle element type (Tab / Shift+Tab). */
export function nextElement(current: ElementType, dir: 1 | -1 = 1): ElementType {
  const i = ELEMENT_CYCLE.indexOf(current);
  const n = ELEMENT_CYCLE.length;
  return ELEMENT_CYCLE[(i + dir + n) % n];
}

/** Element type for the new block created when pressing Enter. */
export function nextElementFor(prev: ElementType): ElementType {
  switch (prev) {
    case 'scene-heading':
      return 'action';
    case 'character':
    case 'parenthetical':
      return 'dialogue';
    case 'transition':
      return 'scene-heading';
    case 'dialogue':
    case 'centered':
    case 'note':
    case 'action':
    default:
      return 'action';
  }
}

export interface BlockIssue {
  blockId: string;
  message: string;
  severity: 'error' | 'warning';
}

const empty = (b: Block) => b.text.trim() === '';

/**
 * Validate screenplay structure. The hard rule: no blank lines inside a
 * character → (parenthetical) → dialogue group. A "blank line" here is an
 * empty block sitting inside the run from a character cue through the end of
 * its dialogue. Empty character/parenthetical/dialogue blocks anywhere are
 * also errors; other empties and ordering oddities are warnings.
 */
export function validateBlocks(blocks: Block[]): BlockIssue[] {
  const issues: BlockIssue[] = [];
  const isEmpty = blocks.map(empty);

  // Find the span of each character group and flag any empty block inside it.
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'character' && !isEmpty[i]) {
      // The group run extends through group-typed blocks, tolerating empty
      // blocks in the middle — as long as more group content follows them.
      let j = i + 1;
      while (
        j < blocks.length &&
        (isDialogueGroupType(blocks[j].type) || isEmpty[j])
      ) {
        j++;
      }
      // Trim trailing empties back to the last real group member.
      let end = j;
      while (end > i + 1 && !(isDialogueGroupType(blocks[end - 1].type) && !isEmpty[end - 1])) {
        end--;
      }
      for (let k = i; k < end; k++) {
        if (isEmpty[k]) {
          issues.push({
            blockId: blocks[k].id,
            message: 'Blank line inside a dialogue block',
            severity: 'error',
          });
        }
      }
      i = j;
      continue;
    }
    if (isEmpty[i] && isDialogueGroupType(b.type)) {
      issues.push({
        blockId: b.id,
        message: `Empty ${ELEMENT_LABELS[b.type].toLowerCase()} element`,
        severity: 'error',
      });
    }
    i++;
  }

  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (isEmpty[k]) {
      if (!isDialogueGroupType(b.type)) {
        issues.push({
          blockId: b.id,
          message: 'Empty element',
          severity: 'warning',
        });
      }
      continue;
    }
    if (b.type === 'parenthetical') {
      const prev = prevNonEmpty(blocks, k);
      if (!prev || (prev.type !== 'character' && prev.type !== 'parenthetical' && prev.type !== 'dialogue')) {
        issues.push({
          blockId: b.id,
          message: 'Parenthetical without a character cue',
          severity: 'warning',
        });
      }
    }
    if (b.type === 'character') {
      const nxt = nextNonEmpty(blocks, k);
      if (!nxt || !isDialogueGroupType(nxt.type)) {
        issues.push({
          blockId: b.id,
          message: 'Character cue not followed by dialogue',
          severity: 'warning',
        });
      }
    }
  }
  return issues;
}

function prevNonEmpty(blocks: Block[], from: number): Block | undefined {
  for (let k = from - 1; k >= 0; k--) {
    if (!empty(blocks[k])) return blocks[k];
  }
  return undefined;
}

function nextNonEmpty(blocks: Block[], from: number): Block | undefined {
  for (let k = from + 1; k < blocks.length; k++) {
    if (!empty(blocks[k])) return blocks[k];
  }
  return undefined;
}

/**
 * Return a copy of `blocks` with structure normalized:
 * - empty blocks inside character groups removed (the no-blank-lines rule),
 * - empty group-typed blocks removed,
 * - parentheticals wrapped in ( ),
 * - scene headings / characters / transitions upper-cased.
 * Safe to run before every export and after paste/import.
 */
export function normalizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const text = b.text.trim();
    if (text === '') {
      if (isDialogueGroupType(b.type)) continue; // drop empty group members entirely
      // keep non-group empty blocks only if they don't split a character group
      const prev = prevNonEmpty(blocks, k);
      const next = nextNonEmpty(blocks, k);
      if (
        prev &&
        next &&
        isDialogueGroupType(prev.type) &&
        isDialogueGroupType(next.type)
      ) {
        continue;
      }
      out.push({ ...b, text });
      continue;
    }
    let fixed = text;
    switch (b.type) {
      case 'scene-heading':
      case 'character':
      case 'transition':
        fixed = text.toUpperCase();
        break;
      case 'parenthetical':
        if (!text.startsWith('(')) fixed = `(${text}`;
        if (!fixed.endsWith(')')) fixed = `${fixed})`;
        break;
      default:
        break;
    }
    out.push({ ...b, text: fixed });
  }
  return out;
}
