import { escapeText } from "./escape-text.js";
import type { RelationCandidate } from "./relation-candidate.js";
import { displayName } from "./relation-display-name.js";
import type { RelationGroup } from "./relation-group.js";

function renderCandidate(candidate: RelationCandidate): string {
  const name = escapeText(displayName(candidate));
  return candidate.external
    ? `<li data-external="true">${name}</li>`
    : `<li data-focus="${escapeText(candidate.local_handle ?? "")}">` +
        `${name}</li>`;
}

function renderLoadedGroup(group: RelationGroup): string {
  const rows = group.candidates.map(renderCandidate).join("");
  const omitted =
    group.omitted_count > 0 ? `<p>${group.omitted_count} omitted</p>` : "";
  return (
    `<section data-relation="${group.relation}" data-state="loaded">` +
    `<ul>${rows}</ul>${omitted}</section>`
  );
}

/** Renders only local candidates as focusable rows. External candidates expose
 * display identity without source-derived detail.
 */
export function renderRelationGroup(group: RelationGroup): string {
  if (group.state !== "loaded")
    return (
      `<section data-relation="${group.relation}" ` +
      `data-state="${group.state}">${group.state}</section>`
    );
  if (group.candidates.length === 0)
    return (
      `<section data-relation="${group.relation}" data-state="empty">` +
      "empty</section>"
    );
  return renderLoadedGroup(group);
}
