// Compact, readable text output (YAML-like) — cheaper in tokens than pretty JSON.

const needsQuotes = (s: string) =>
  s === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|\n/.test(s) || /^(true|false|null|yes|no|~|-?\d[\d.e+-]*)$/i.test(s);

function scalar(v: unknown): string {
  if (v === null || v === undefined) return '~';
  if (typeof v === 'string') return needsQuotes(v) ? JSON.stringify(v) : v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  return String(v);
}

const isScalar = (v: unknown) => v === null || v === undefined || typeof v !== 'object';

function inlineArray(arr: unknown[]): string | null {
  if (!arr.every(isScalar)) return null;
  const s = `[${arr.map(scalar).join(', ')}]`;
  return s.length <= 100 ? s : null;
}

function inlineObject(o: Record<string, unknown>): string | null {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined);
  if (!entries.every(([, v]) => isScalar(v))) return null;
  const s = `{${entries.map(([k, v]) => `${k}: ${scalar(v)}`).join(', ')}}`;
  return s.length <= 90 ? s : null;
}

export function yaml(v: unknown, indent = ''): string {
  if (isScalar(v)) return scalar(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const inl = inlineArray(v);
    if (inl) return inl;
    return v
      .map((item) => {
        if (isScalar(item)) return `${indent}- ${scalar(item)}`;
        if (Array.isArray(item)) return `${indent}- ${yaml(item, indent + '  ').trimStart()}`;
        const io = inlineObject(item as Record<string, unknown>);
        if (io) return `${indent}- ${io}`;
        const body = yaml(item, indent + '  ');
        return `${indent}- ${body.trimStart()}`;
      })
      .join('\n');
  }
  const o = v as Record<string, unknown>;
  const entries = Object.entries(o).filter(([, val]) => val !== undefined);
  if (!entries.length) return '{}';
  return entries
    .map(([k, val]) => {
      const key = /^[\w$@./:\- ]+$/.test(k) && !needsQuotes(k) ? k : JSON.stringify(k);
      if (isScalar(val)) return `${indent}${key}: ${scalar(val)}`;
      if (Array.isArray(val)) {
        const inl = inlineArray(val);
        if (inl || !val.length) return `${indent}${key}: ${inl ?? '[]'}`;
        return `${indent}${key}:\n${yaml(val, indent + '  ')}`;
      }
      const io = inlineObject(val as Record<string, unknown>);
      if (io) return `${indent}${key}: ${io}`;
      return `${indent}${key}:\n${yaml(val, indent + '  ')}`;
    })
    .join('\n');
}

/** Drops undefined/empty values so outputs stay short. */
export function compact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(compact).filter((x) => x !== undefined) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const c = compact(val);
      if (c === undefined || c === null) continue;
      if (Array.isArray(c) && !c.length) continue;
      if (typeof c === 'object' && !Array.isArray(c) && !Object.keys(c as object).length) continue;
      out[k] = c;
    }
    return out as T;
  }
  return v;
}

export function truncateText(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max) + `\n… (truncated ${s.length - max} chars)`, truncated: true };
}
