// sidebar.mjs - the tab bar and the two lists inside a project.

import { el } from "./dom.mjs";

const matches = (name, filter) => name.toLowerCase().includes(filter.toLowerCase());

export function renderTabs(projects, active, { onSelect, onScan }) {
  const tabs = projects.map((project, index) =>
    el(
      "button",
      {
        type: "button",
        class: `tab${index === active ? " active" : ""}${project.readable ? "" : " missing"}`,
        title: project.path,
        onclick: () => onSelect(index),
      },
      project.name,
    ),
  );
  return [...tabs, el("button", { type: "button", class: "tab add", title: "Find projects", onclick: onScan }, "+")];
}

function entry(label, note, selected, onclick) {
  return el("button", { type: "button", class: selected ? "entry selected" : "entry", onclick }, [
    el("span", { class: "entry-name" }, label),
    el("span", { class: "entry-note" }, note),
  ]);
}

function group(title, rows) {
  return el("div", { class: "group" }, [
    el("h3", {}, title),
    rows.length ? el("div", { class: "entries" }, rows) : el("p", { class: "empty" }, `No ${title.toLowerCase()}.`),
  ]);
}

// A spec id is "<package>/<name>" after the per-package split. An id with no
// slash has no package, so it gets its own group titled by the full id.
function splitSpecId(id) {
  const cut = id.lastIndexOf("/");
  return cut === -1 ? { title: id, label: id } : { title: id.slice(0, cut), label: id.slice(cut + 1) };
}

function groupSpecs(specs, { selection, onOpen }) {
  const isOpen = (id) => selection?.kind === "spec" && selection.id === id;
  const byTitle = new Map();
  for (const spec of specs) {
    const { title, label } = splitSpecId(spec.id);
    const bucket = byTitle.get(title) ?? [];
    bucket.push({ spec, label });
    byTitle.set(title, bucket);
  }
  return [...byTitle.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, rows]) => {
      const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label));
      const specRows = sorted.map(({ spec, label }) =>
        entry(label, `${spec.requirementCount} reqs`, isOpen(spec.id), () => onOpen("spec", spec.id)),
      );
      return group(title, specRows);
    });
}

export function renderLists({ changes, specs }, { filter, selection, onOpen }) {
  const isOpen = (kind, id) => selection?.kind === kind && selection.id === id;
  const changeRows = changes
    .filter((change) => matches(change.name, filter))
    .map((change) =>
      entry(change.name, `${change.completedTasks}/${change.totalTasks}`, isOpen("change", change.name), () =>
        onOpen("change", change.name),
      ),
    );
  const matchingSpecs = specs.filter((spec) => matches(spec.id, filter));
  return [group("Active changes", changeRows), ...groupSpecs(matchingSpecs, { selection, onOpen })];
}
