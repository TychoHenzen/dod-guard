import { renderShellHeader } from "./browser-shell-header.js";
import { escapeText } from "./escape-text.js";
import type { BrowserShellState, LandmarkGroup } from "./types.js";

function renderLandmark(item: LandmarkGroup["items"][number]): string {
  if (typeof item === "string") return `<li>${escapeText(item)}</li>`;
  return (
    `<li><button type="button" ` +
    `data-symbol-id="${escapeText(item.symbol_id)}">` +
    `${escapeText(item.name)}</button> <span>` +
    `${escapeText(item.kind)} Ã‚Â· ${escapeText(item.path)}</span></li>`
  );
}
function renderLandmarks(landmarks: readonly LandmarkGroup[]): string {
  if (landmarks.length === 0)
    return '<p data-state="empty">No landmarks available</p>';
  return landmarks
    .map(
      ({ group, items }) =>
        `<section class="landmark-group"><h3>${escapeText(group)}</h3>` +
        `<ul>${items.map(renderLandmark).join("")}</ul></section>`,
    )
    .join("");
}
function drawerButton(name: "discovery" | "relations", open: boolean): string {
  const label = name === "discovery" ? "Discovery" : "Relations";
  return (
    `<button type="button" data-drawer="${name}" ` +
    `aria-controls="${name}-pane" aria-expanded="${open}">${label}</button>`
  );
}
function renderFocus(focus: BrowserShellState["focus"]): string {
  if (!focus) return '<p data-state="empty-focus">Select a symbol</p>';
  return (
    `<article class="focused-symbol"><h2>${escapeText(focus.name)}</h2>` +
    `<p>${escapeText(focus.kind)} Ã‚Â· ${escapeText(focus.path)}</p></article>`
  );
}
function renderDiscoveryButton(
  state: BrowserShellState,
  narrow: boolean,
): string {
  return narrow
    ? drawerButton("discovery", state.activeDrawer === "discovery")
    : "";
}
function renderRelationButton(
  state: BrowserShellState,
  narrow: boolean,
): string {
  return narrow
    ? drawerButton("relations", state.activeDrawer === "relations")
    : "";
}
/** Produces the application shell from text-only state, with no untrusted
 * markup interpolation.
 */
export function renderBrowserShell(
  state: BrowserShellState,
  viewportWidth: number,
): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    "<title>Code Explorer</title></head><body>" +
    renderBrowserBody(state, viewportWidth) +
    "</body></html>"
  );
}
/** Renders the application body for the packaged page that already owns the
 * document head.
 */
export function renderBrowserBody(
  state: BrowserShellState,
  viewportWidth: number,
): string {
  const narrow = viewportWidth < 900;
  const disabled = state.navigationEnabled ? "" : " disabled";
  const main =
    `<main class="explorer-shell ${narrow ? "narrow" : "desktop"}">` +
    renderDiscoveryButton(state, narrow) +
    `<aside id="discovery-pane" data-pane="discovery"><h2>Landmarks</h2>` +
    `<label>Search <input type="search" ` +
    `data-operation="search"${disabled}></label>` +
    `<div data-area="discovery">${renderLandmarks(state.landmarks)}</div>` +
    "</aside>" +
    `<section data-pane="focus"><h1>Focused source</h1>` +
    `<div data-area="source">${renderFocus(state.focus)}</div>` +
    `<div data-area="graph" data-state="empty">No graph loaded</div>` +
    "</section>" +
    `<aside id="relations-pane" data-pane="relations"><h2>Relations</h2>` +
    `<p data-state="empty-relations">No relations loaded</p></aside>` +
    `${renderRelationButton(state, narrow)}</main>`;
  return renderShellHeader(state) + main;
}
