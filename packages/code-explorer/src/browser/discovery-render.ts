import type { BrowserLandmarkGroup } from "./browser-landmark-group.js";
import type { DiscoveryState } from "./discovery-state.js";
import { escapeText } from "./escape-text.js";

function renderLandmarks(landmarks: readonly BrowserLandmarkGroup[]): string {
  return landmarks
    .map(
      (group) =>
        `<section class="landmark-group"><h3>${escapeText(group.group)}</h3>` +
        `<ul>${group.items.map(renderLandmark).join("")}</ul>` +
        "</section>",
    )
    .join("");
}
function renderLandmark(item: BrowserLandmarkGroup["items"][number]): string {
  const label = item.symbol_id
    ? `<button type="button" data-symbol-id="${escapeText(item.symbol_id)}">` +
      `${escapeText(item.name)}</button>`
    : escapeText(item.name);
  return (
    `<li>${label} <span>${escapeText(item.kind)} Ã‚Â· ` +
    `${escapeText(item.path)}</span></li>`
  );
}
function candidateName(
  candidate: DiscoveryState["candidates"][number],
): string {
  if (candidate.type === "file")
    return candidate.path.split("/").at(-1) ?? candidate.path;
  return candidate.name;
}
function candidateKind(
  candidate: DiscoveryState["candidates"][number],
): string {
  if (candidate.type === "file") return "file";
  return candidate.kind;
}
function candidateLabel(
  candidate: DiscoveryState["candidates"][number],
  name: string,
): string {
  if (candidate.identity)
    return (
      `<button type="button" ` +
      `data-symbol-id="${escapeText(candidate.identity)}">` +
      `${escapeText(name)}</button>`
    );
  return `<strong>${escapeText(name)}</strong>`;
}
function renderCandidate(
  candidate: DiscoveryState["candidates"][number],
): string {
  const kind = candidateKind(candidate);
  const label = candidateLabel(candidate, candidateName(candidate));
  return (
    `<li data-match-class="${escapeText(candidate.match_class)}">${label} ` +
    `<span>${escapeText(candidate.match_class)} ` +
    `${candidate.match_score}</span> ` +
    `<span>${escapeText(candidate.path)} Ã‚Â· ${escapeText(kind)}</span></li>`
  );
}
/** Renders only service-provided fields. Candidate order is intentionally
 * unchanged.
 */
export function renderDiscovery(state: DiscoveryState): string {
  if (!isRenderableAreaState(state.areaState)) return renderErrorState(state);
  if (state.mode === "landmarks") return renderLandmarkState(state);
  return renderCandidateState(state);
}
function isRenderableAreaState(state: DiscoveryState["areaState"]): boolean {
  return ["ready", "empty", "not_loaded"].includes(state);
}

function renderErrorState(state: DiscoveryState): string {
  return (
    `<section data-discovery="results" data-state="${state.areaState}">` +
    `${state.error ?? state.areaState}</section>`
  );
}

function renderLandmarkState(state: DiscoveryState): string {
  return (
    `<section data-discovery="landmarks">` +
    `${renderLandmarks(state.landmarks)}</section>`
  );
}

function renderCandidateState(state: DiscoveryState): string {
  const candidates = state.candidates.map(renderCandidate).join("");
  const omitted =
    state.omittedCount > 0 ? `<p>${state.omittedCount} omitted</p>` : "";
  const guidance = state.refinementGuidance
    ? `<p>${escapeText(state.refinementGuidance)}</p>`
    : "";
  return (
    `<section data-discovery="results" data-state="${state.areaState}">` +
    `<ul>${candidates}</ul>${omitted}${guidance}</section>`
  );
}
