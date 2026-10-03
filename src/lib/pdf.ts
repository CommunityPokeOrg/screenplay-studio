import { jsPDF } from 'jspdf';
import { isDialogueGroupType, normalizeBlocks } from './elements';
import { wrap } from './text';
import type { Block, Episode, Project, Scene, Series } from './types';

// US Letter in points; screenplay margins: 1.5" left, 1" right/top/bottom.
const PAGE_H = 792;
const LEFT = 108; // 1.5"
const RIGHT_EDGE = 540; // 7.5"
const TOP = 72;
const BOTTOM = 72;
const LINE_H = 12; // 6 lines per inch
const CHAR_W = 7.2; // Courier 12pt advance width

const CHARS = (widthPt: number) => Math.floor(widthPt / CHAR_W);

const X: Record<Block['type'], number> = {
  'scene-heading': LEFT,
  action: LEFT,
  character: 266, // 3.7"
  parenthetical: 223, // 3.1"
  dialogue: 180, // 2.5"
  transition: LEFT,
  centered: LEFT,
  note: LEFT,
};

const W: Record<Block['type'], number> = {
  'scene-heading': RIGHT_EDGE - LEFT,
  action: RIGHT_EDGE - LEFT,
  character: RIGHT_EDGE - 266,
  parenthetical: 216, // 3.0"
  dialogue: 238, // ~3.3"
  transition: RIGHT_EDGE - LEFT,
  centered: RIGHT_EDGE - LEFT,
  note: RIGHT_EDGE - LEFT,
};

function blockLines(b: Block): string[] {
  const chars = CHARS(W[b.type]);
  if (b.type === 'note') return wrap(`[[ ${b.text} ]]`, chars);
  return wrap(b.text, chars);
}

/** Render the full project (or filtered subset) to a PDF Blob via jsPDF. */
export function exportPdf(
  project: Project,
  seriesList: Series[],
  episodes: Episode[],
  scenes: Scene[],
  opts: { episodeId?: string } = {},
): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setFont('courier', 'normal', 12);

  let y = TOP;
  const newPage = () => {
    doc.addPage('letter');
    y = TOP;
  };
  const emit = (text: string, x: number, alignRight = false, centered = false) => {
    if (y + LINE_H > PAGE_H - BOTTOM) newPage();
    if (alignRight) doc.text(text, RIGHT_EDGE, y, { align: 'right' });
    else if (centered) doc.text(text, (LEFT + RIGHT_EDGE) / 2, y, { align: 'center' });
    else doc.text(text, x, y);
    y += LINE_H;
  };
  const blank = () => emit('', LEFT);

  // Title page
  const titleLines = wrap(project.title.toUpperCase(), CHARS(RIGHT_EDGE - LEFT));
  const midY = PAGE_H / 2 - titleLines.length * LINE_H;
  y = midY;
  for (const l of titleLines) emit(l, LEFT, false, true);
  blank();
  emit('written by', LEFT, false, true);
  blank();
  emit(project.author, LEFT, false, true);
  newPage();

  const printScene = (scene: Scene) => {
    const blocks = normalizeBlocks(scene.blocks);
    let prev: Block | undefined;
    for (const b of blocks) {
      const needsBlank =
        prev &&
        !(isDialogueGroupType(prev.type) && (b.type === 'parenthetical' || b.type === 'dialogue'));
      if (needsBlank) blank();
      for (const line of blockLines(b)) {
        if (b.type === 'transition') emit(line, X[b.type], true);
        else if (b.type === 'centered') emit(line, X[b.type], false, true);
        else emit(line, X[b.type]);
      }
      prev = b;
    }
    blank();
  };

  const filteredEps = episodes
    .filter((e) => !opts.episodeId || e.id === opts.episodeId)
    .sort((a, b) => a.order - b.order);
  const sortedSeries = [...seriesList].sort((a, b) => a.order - b.order);

  if (opts.episodeId) {
    const ep = filteredEps[0];
    emit(`EPISODE ${ep.number}${ep.title ? ' — ' + ep.title.toUpperCase() : ''}`, LEFT);
    blank();
    for (const s of scenes.filter((x) => x.episodeId === ep.id).sort((a, b) => a.order - b.order)) {
      printScene(s);
    }
  } else {
    for (const series of sortedSeries) {
      const eps = filteredEps.filter((e) => e.seriesId === series.id);
      if (eps.length === 0) continue;
      emit(series.title.toUpperCase(), LEFT, false, true);
      blank();
      for (const ep of eps) {
        emit(`EPISODE ${ep.number}${ep.title ? ' — ' + ep.title.toUpperCase() : ''}`, LEFT);
        blank();
        for (const s of scenes
          .filter((x) => x.episodeId === ep.id)
          .sort((a, b) => a.order - b.order)) {
          printScene(s);
        }
      }
    }
  }

  return doc.output('blob');
}
