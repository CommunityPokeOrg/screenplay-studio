import { useEffect, useMemo, useRef } from 'react';
import {
  ELEMENT_CYCLE,
  ELEMENT_LABELS,
  ELEMENT_SHORTCUT,
  nextElement,
  nextElementFor,
  normalizeBlocks,
  validateBlocks,
} from '../lib/elements';
import { uid } from '../lib/text';
import type { Block, ElementType } from '../lib/types';
import { useStore } from '../state/StoreContext';

const UPPERCASE_TYPES = new Set<ElementType>(['scene-heading', 'character', 'transition']);

export default function Editor({ onBack }: { onBack: () => void }) {
  const { state, dispatch, syncNow } = useStore();
  const scene = state.selection.sceneId ? state.doc.scenes[state.selection.sceneId] : undefined;
  const focusId = useRef<string | null>(null);
  const blockEls = useRef(new Map<string, HTMLTextAreaElement>());

  const issues = useMemo(() => (scene ? validateBlocks(scene.blocks) : []), [scene]);
  const issueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of issues) m.set(i.blockId, i.message);
    return m;
  }, [issues]);

  // Global save shortcut: Ctrl/Cmd+S → push now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void syncNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [syncNow]);

  // Focus management for newly inserted/deleted blocks.
  useEffect(() => {
    if (focusId.current) {
      const el = blockEls.current.get(focusId.current);
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      focusId.current = null;
    }
  }, [scene?.blocks]);

  if (!scene) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-neutral-500">
        <button className="text-sm text-blue-600 md:hidden" onClick={onBack}>
          ← Back to outline
        </button>
        <p>Select a scene from the outline, or create one.</p>
      </div>
    );
  }

  const blocks = scene.blocks;
  const update = (next: Block[]) =>
    dispatch({ type: 'updateBlocks', sceneId: scene.id, blocks: next });

  const focusBlock = (id: string | undefined) => {
    if (!id) return;
    focusId.current = id;
    const el = blockEls.current.get(id);
    if (el) {
      el.focus();
      focusId.current = null;
    }
  };

  const setBlockText = (i: number, text: string) => {
    const next = [...blocks];
    const t = next[i].type;
    next[i] = { ...next[i], text: UPPERCASE_TYPES.has(t) ? text.toUpperCase() : text };
    update(next);
  };

  const setBlockType = (i: number, type: ElementType) => {
    const next = [...blocks];
    next[i] = { ...next[i], type };
    update(next);
  };

  const insertAfter = (i: number, type: ElementType) => {
    const b: Block = { id: uid(), type, text: '' };
    const next = [...blocks.slice(0, i + 1), b, ...blocks.slice(i + 1)];
    focusId.current = b.id;
    update(next);
  };

  const removeAt = (i: number) => {
    if (blocks.length <= 1) {
      update([{ id: uid(), type: 'action', text: '' }]);
      return;
    }
    const next = [...blocks.slice(0, i), ...blocks.slice(i + 1)];
    const target = next[Math.max(0, i - 1)]?.id;
    focusId.current = target ?? null;
    update(next);
  };

  const moveAt = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    focusId.current = next[j].id;
    update(next);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const block = blocks[i];

    if ((e.ctrlKey || e.metaKey) && /^[1-8]$/.test(e.key)) {
      e.preventDefault();
      const t = ELEMENT_CYCLE.find((t) => ELEMENT_SHORTCUT[t] === e.key);
      if (t) setBlockType(i, t);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      setBlockType(i, nextElement(block.type, e.shiftKey ? -1 : 1));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Blocks never contain newlines: Enter ends the element and starts the
      // next one — which is exactly how a screenplay block editor prevents
      // blank lines inside a character/dialogue group.
      e.preventDefault();
      if (block.text.trim() === '') {
        // Enter on an empty block cycles the type instead of stacking blanks.
        setBlockType(i, nextElement(block.type));
        return;
      }
      insertAfter(i, nextElementFor(block.type));
      return;
    }
    if (e.key === 'Backspace' && el.value === '') {
      e.preventDefault();
      removeAt(i);
      return;
    }
    if (e.key === 'ArrowUp' && el.selectionStart === 0 && i > 0) {
      e.preventDefault();
      focusBlock(blocks[i - 1].id);
      return;
    }
    if (e.key === 'ArrowDown' && el.selectionStart === el.value.length && i < blocks.length - 1) {
      e.preventDefault();
      focusBlock(blocks[i + 1].id);
      return;
    }
  };

  const normalizeScene = () => update(normalizeBlocks(blocks));

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
      <button className="mb-2 text-sm text-blue-600 md:hidden" onClick={onBack}>
        ← Back to outline
      </button>

      <input
        className="w-full bg-transparent text-lg font-semibold focus:outline-none"
        placeholder="Scene title"
        value={scene.title}
        onChange={(e) =>
          dispatch({ type: 'upsert', kind: 'scene', entity: { ...scene, title: e.target.value } })
        }
      />
      <input
        className="mb-4 w-full bg-transparent text-sm text-neutral-500 focus:outline-none"
        placeholder="Scene synopsis (for the beat/outline view)"
        value={scene.synopsis}
        onChange={(e) =>
          dispatch({ type: 'upsert', kind: 'scene', entity: { ...scene, synopsis: e.target.value } })
        }
      />

      {issues.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <span>
            {issues.length} formatting issue{issues.length > 1 ? 's' : ''}
          </span>
          <button className="rounded border border-red-400 px-2 py-0.5 hover:bg-red-100" onClick={normalizeScene}>
            Fix automatically
          </button>
        </div>
      )}

      <div className="screenplay-page rounded-md bg-white p-4 shadow-sm sm:p-8 dark:bg-neutral-900">
        {blocks.map((b, i) => {
          const issue = issueMap.get(b.id);
          return (
            <div key={b.id} className={`group relative el-${b.type}`}>
              <div className="flex items-start gap-1">
                <select
                  className="mt-1 w-24 shrink-0 cursor-pointer rounded border border-transparent bg-transparent text-[10px] uppercase text-neutral-400 opacity-60 hover:opacity-100 focus:opacity-100 sm:w-28"
                  value={b.type}
                  title={`Element type (Tab to cycle, Ctrl+${ELEMENT_SHORTCUT[b.type]} for this type)`}
                  onChange={(e) => setBlockType(i, e.target.value as ElementType)}
                  tabIndex={-1}
                >
                  {ELEMENT_CYCLE.map((t) => (
                    <option key={t} value={t}>
                      {ELEMENT_LABELS[t]}
                    </option>
                  ))}
                </select>
                <textarea
                  ref={(el) => {
                    if (el) blockEls.current.set(b.id, el);
                    else blockEls.current.delete(b.id);
                  }}
                  className={`min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-1 leading-6 focus:outline-none ${
                    issue ? 'rounded bg-red-50 outline outline-1 outline-red-400 dark:bg-red-950/50' : ''
                  }`}
                  rows={1}
                  value={b.text}
                  placeholder={ELEMENT_LABELS[b.type]}
                  onChange={(e) => {
                    setBlockText(i, e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onFocus={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                />
                <span className="mt-1 hidden shrink-0 flex-col text-xs text-neutral-400 group-hover:flex">
                  <button title="Move up" onClick={() => moveAt(i, -1)} disabled={i === 0}>↑</button>
                  <button title="Move down" onClick={() => moveAt(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                  <button title="Delete element" onClick={() => removeAt(i)}>✕</button>
                </span>
              </div>
              {issue && <div className="pl-28 text-[10px] text-red-500">{issue}</div>}
            </div>
          );
        })}

        <div className="mt-4 flex gap-2">
          <AddBlockMenu onAdd={(t) => insertAfter(blocks.length - 1, t)} />
          <button
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            onClick={normalizeScene}
            title="Normalize casing, parentheticals, and remove blank lines in dialogue"
          >
            Normalize
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Enter: new element · Tab / Shift+Tab: cycle element type · Ctrl+1–8: set type ·
        Backspace on empty: delete · Ctrl+S: sync now
      </p>
    </div>
  );
}

function AddBlockMenu({ onAdd }: { onAdd: (t: ElementType) => void }) {
  return (
    <select
      className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as ElementType);
      }}
    >
      <option value="">＋ Add element…</option>
      {ELEMENT_CYCLE.map((t) => (
        <option key={t} value={t}>
          {ELEMENT_LABELS[t]}
        </option>
      ))}
    </select>
  );
}
