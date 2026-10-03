/** Greedy word wrap preserving existing single-line text. */
export function wrap(text: string, width: number): string[] {
  if (text === '') return [''];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line === '') {
      line = w;
    } else if (line.length + 1 + w.length <= width) {
      line += ' ' + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '' || lines.length === 0) lines.push(line);
  return lines;
}

export function padEnd(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

export function center(s: string, width: number): string {
  if (s.length >= width) return s;
  const left = Math.floor((width - s.length) / 2);
  return ' '.repeat(left) + s;
}

export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'screenplay';
}

export function uid(): string {
  // crypto.randomUUID when available (all modern browsers/workers), else fallback.
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
