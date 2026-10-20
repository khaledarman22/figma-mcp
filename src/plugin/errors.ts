import type { ErrorCode } from '../shared/protocol.ts';

/** An error the agent can act on: a code, a message that says what to do, optional details. */
export class PluginError extends Error {
  code: ErrorCode;
  details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new PluginError('BAD_REQUEST', message, details);
export const notFound = (message: string, details?: unknown) => new PluginError('NOT_FOUND', message, details);

/** Figma's own errors come in as "in set_x: …". Make them readable and add the fix when we know it. */
export function explainFigmaError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const hints: Array<[RegExp, string]> = [
    [/unloaded font/i, 'Fonts are loaded automatically by build/edit; in execute call `await h.loadFonts(node)` before editing text.'],
    [/FILL can only be set on children of auto-layout/i, 'Use w/h "fill" only inside a parent with dir row/column/grid.'],
    [/HUG can only be set/i, '"hug" works on auto-layout frames and text only; give shapes a number.'],
    [/Setting figma\.currentPage is not supported/i, 'Use `await figma.setCurrentPageAsync(page)`.'],
    [/object is not extensible/i, 'That property does not exist on this node type.'],
    [/no setter for property/i, 'width/height are read-only: use resize() (or w/h in build/edit).'],
    [/Can only get\/set component property definitions/i, 'Component properties live on the component set (or a non-variant component).'],
    [/documentAccess: dynamic-page/i, 'Use the async API variant (…Async).'],
    [/Unable to establish connection to Figma/i, 'Figma Desktop lost its connection to Figma\'s servers (internet or Figma outage) — nothing is wrong with the request. Wait until Figma reconnects (its toolbar shows offline status), then retry.'],
  ];
  for (const [re, hint] of hints) if (re.test(msg)) return `${msg} — ${hint}`;
  return msg;
}
