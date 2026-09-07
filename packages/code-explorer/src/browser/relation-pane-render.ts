import type { RelationCandidate } from "./relation-candidate.js";
import type { RelationGroup } from "./relation-group.js";
import {
  browserRelations,
  isBrowserRelation,
  relationName,
} from "./relation-data.js";
import type { FocusedSource } from "./source.js";

type RelationHandle = FocusedSource["handles"][number];

function textElement(tag: "h2" | "p", text: string): HTMLElement {
  return Object.assign(document.createElement(tag), { textContent: text });
}

export function resetRelationPane(): void {
  const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
  if (!pane) return;
  pane.dataset.state = "empty";
  pane.replaceChildren(
    textElement("h2", "Relations"),
    textElement("p", "No relations loaded"),
  );
}

export function renderRelationChoices(
  pane: HTMLElement,
  handle: RelationHandle,
  open: (relation: (typeof browserRelations)[number]) => void,
): void {
  pane.dataset.state = "empty";
  pane.replaceChildren(textElement("h2", "Relations"));
  for (const relation of handle.relations.filter(isBrowserRelation)) {
    const button = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: relation,
    });
    button.dataset.relation = relation;
    button.addEventListener("click", () => open(relation));
    pane.append(button);
  }
}

export function renderRelationGroup(options: {
  source: FocusedSource;
  activeRelationKey: string | undefined;
  relation: (typeof browserRelations)[number];
  group: RelationGroup;
  select: (candidate: RelationCandidate) => void;
}): void {
  const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
  if (
    !pane ||
    !options.activeRelationKey?.startsWith(`${options.source.view_id}:`)
  )
    return;
  pane.replaceChildren(textElement("h2", `Relations: ${options.relation}`));
  if (options.group.state !== "loaded") {
    pane.dataset.state = options.group.state;
    pane.append(textElement("p", options.group.state));
    return;
  }
  pane.dataset.state = "ready";
  renderLoadedGroup(pane, options.group, options.select);
}

function renderLoadedGroup(
  pane: HTMLElement,
  group: RelationGroup,
  select: (candidate: RelationCandidate) => void,
): void {
  if (group.candidates.length === 0) {
    pane.append(textElement("p", "empty"));
    return;
  }
  for (const candidate of group.candidates)
    pane.append(relationElement(candidate, select));
}

function relationElement(
  candidate: RelationCandidate,
  select: (candidate: RelationCandidate) => void,
): HTMLElement {
  const label = relationName(candidate);
  if (candidate.external) return textElement("p", label);
  const button = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: label,
  });
  button.addEventListener("click", () => select(candidate));
  return button;
}
