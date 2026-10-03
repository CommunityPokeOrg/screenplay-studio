import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { isDialogueGroupType, normalizeBlocks } from './elements';
import type { Block, Episode, Project, Scene, Series } from './types';

// Indents in twips (1440 = 1"). Page has 1.5" left / 1" right margins, so
// element indents are relative to the 1.5" margin.
const INDENT: Record<Block['type'], { left: number; right: number }> = {
  'scene-heading': { left: 0, right: 0 },
  action: { left: 0, right: 0 },
  character: { left: 3168, right: 0 }, // absolute 3.7"
  parenthetical: { left: 2304, right: 1728 }, // absolute 3.1", ~3.0" wide
  dialogue: { left: 1440, right: 2448 }, // absolute 2.5", ~3.3" wide
  transition: { left: 0, right: 0 },
  centered: { left: 0, right: 0 },
  note: { left: 0, right: 0 },
};

function para(text: string, b: Block, spaceAfter: number): Paragraph {
  return new Paragraph({
    alignment:
      b.type === 'transition'
        ? AlignmentType.RIGHT
        : b.type === 'centered'
          ? AlignmentType.CENTER
          : AlignmentType.LEFT,
    indent: { left: INDENT[b.type].left, right: INDENT[b.type].right },
    spacing: { after: spaceAfter, line: 240 },
    children: [
      new TextRun({
        text: b.type === 'note' ? `[[ ${text} ]]` : text,
        font: 'Courier New',
        size: 24, // half-points → 12pt
        bold: b.type === 'scene-heading',
      }),
    ],
  });
}

function sceneParagraphs(scene: Scene): Paragraph[] {
  const blocks = normalizeBlocks(scene.blocks);
  const out: Paragraph[] = [];
  let prev: Block | undefined;
  for (const b of blocks) {
    const needsBlank =
      out.length > 0 &&
      !(prev && isDialogueGroupType(prev.type) && (b.type === 'parenthetical' || b.type === 'dialogue'));
    if (needsBlank) out.push(new Paragraph({ spacing: { after: 240 } }));
    out.push(para(b.text, b, 0));
    prev = b;
  }
  return out;
}

/** Build a .docx Blob for the project (or a single episode). */
export async function exportDocx(
  project: Project,
  seriesList: Series[],
  episodes: Episode[],
  scenes: Scene[],
  opts: { episodeId?: string } = {},
): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new TextRun({ text: project.title.toUpperCase(), font: 'Courier New', size: 24, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 720 },
      children: [new TextRun({ text: `written by ${project.author}`, font: 'Courier New', size: 24 })],
    }),
  ];

  const eps = episodes
    .filter((e) => !opts.episodeId || e.id === opts.episodeId)
    .sort((a, b) => a.order - b.order);

  const renderEpisode = (ep: Episode) => {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 240 },
        children: [
          new TextRun({
            text: `EPISODE ${ep.number}${ep.title ? ' — ' + ep.title.toUpperCase() : ''}`,
            font: 'Courier New',
            size: 24,
            bold: true,
          }),
        ],
      }),
    );
    for (const s of scenes.filter((x) => x.episodeId === ep.id).sort((a, b) => a.order - b.order)) {
      children.push(...sceneParagraphs(s));
    }
  };

  if (opts.episodeId) {
    if (eps[0]) renderEpisode(eps[0]);
  } else {
    for (const series of [...seriesList].sort((a, b) => a.order - b.order)) {
      const seriesEps = eps.filter((e) => e.seriesId === series.id);
      if (seriesEps.length === 0) continue;
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 480 },
          children: [
            new TextRun({ text: series.title.toUpperCase(), font: 'Courier New', size: 24, bold: true }),
          ],
        }),
      );
      for (const ep of seriesEps) renderEpisode(ep);
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 }, // US Letter in twips
            margin: { top: 1440, bottom: 1440, left: 2160, right: 1440 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
