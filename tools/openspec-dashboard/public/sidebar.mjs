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

export function renderLists({ changes, specs }, { filter, selection, onOpen }) {
  const isOpen = (kind, id) => selection?.kind === kind && selection.id === id;
  const changeRows = changes
    .filter((change) => matches(change.name, filter))
    .map((change) =>
      entry(change.name, `${change.completedTasks}/${change.totalTasks}`, isOpen("change", change.name), () =>
        onOpen("change", change.name),
      ),
    );
  const specRows = specs
    .filter((spec) => matches(spec.id, filter))
    .map((spec) =>
      entry(spec.id, `${spec.requirementCount} reqs`, isOpen("spec", spec.id), () => onOpen("spec", spec.id)),
    );
  return [group("Active changes", changeRows), group("Specs", specRows)];
}
