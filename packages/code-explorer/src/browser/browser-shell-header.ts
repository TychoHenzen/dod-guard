import { escapeText } from "./escape-text.js";
import type { BrowserShellState } from "./types.js";

export function renderShellHeader(state: BrowserShellState): string {
  const disabled = state.navigationEnabled ? "" : " disabled";
  return (
    `<header class="status-strip"><span data-area="status">` +
    `${escapeText(state.status)}</span><nav aria-label="Navigation">` +
    `<button type="button" data-operation="back"${disabled}>Back</button>` +
    `<button type="button" data-operation="forward"${disabled}>` +
    `Forward</button><button type="button" ` +
    `data-operation="refocus"${disabled}>Refocus</button>` +
    `<button type="button" data-operation="refresh">Refresh</button>` +
    "</nav></header>"
  );
}
