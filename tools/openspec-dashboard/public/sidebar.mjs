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

function covClass(bound, total) {
  if (total === 0) return "cov-count cov-none";
  if (bound === total) return "cov-count cov-full";
  if (bound > 0) return "cov-count cov-partial";
  return "cov-count cov-none";
}

function covText(bound, total) {
  if (total === 0) return "";
  return `${bound}/${total}`;
}

function specEntry(name, leaf, selected, onclick) {
  return el("button", { type: "button", class: selected ? "entry selected" : "entry", onclick }, [
    el("span", { class: "entry-name" }, name),
    el("span", { class: covClass(leaf.boundCount, leaf.totalCount) }, covText(leaf.boundCount, leaf.totalCount)),
  ]);
}

function aggregate(node) {
  let bound = 0;
  let total = 0;
  for (const key of Object.keys(node)) {
    if (key === "_leaf") continue;
    const child = node[key];
    if (child._leaf) {
      bound += child.boundCount;
      total += child.totalCount;
    } else {
      const sub = aggregate(child);
      bound += sub.bound;
      total += sub.total;
    }
  }
  return { bound, total };
}

function treeNode(name, node, foldState, pathPrefix, { selection, onOpen, filter }) {
  if (node._leaf) {
    if (filter && !matches(node.id, filter)) return null;
    const selected = selection?.kind === "spec" && selection.id === node.id;
    return specEntry(name, node, selected, () => onOpen("spec", node.id));
  }
  const children = [];
  for (const key of Object.keys(node).sort()) {
    if (key === "_leaf") continue;
    const child = treeNode(key, node[key], foldState, `${pathPrefix}/${key}`, { selection, onOpen, filter });
    if (child) children.push(child);
  }
  if (children.length === 0) return null;
  const agg = aggregate(node);
  const path = `${pathPrefix}/${name}`;
  const open = foldState.get(path) ?? true;
  return el("details", { class: "tree-folder", open: open || undefined }, [
    el("summary", { class: "tree-summary", onclick: () => foldState.set(path, !open) }, [
      el("span", { class: "tree-name" }, name),
      el("span", { class: covClass(agg.bound, agg.total) }, covText(agg.bound, agg.total)),
    ]),
    el("div", { class: "tree-children" }, children),
  ]);
}

function changeEntry(label, note, selected, onclick) {
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

export function renderLists({ changes, specTree }, { filter, selection, onOpen, foldState }) {
  const isOpen = (kind, id) => selection?.kind === kind && selection.id === id;
  const changeRows = changes
    .filter((change) => matches(change.name, filter))
    .map((change) =>
      changeEntry(change.name, `${change.completedTasks}/${change.totalTasks}`, isOpen("change", change.name), () =>
        onOpen("change", change.name),
      ),
    );
  const treeNodes = [];
  if (specTree) {
    for (const key of Object.keys(specTree).sort()) {
      const node = treeNode(key, specTree[key], foldState, "", { selection, onOpen, filter });
      if (node) treeNodes.push(node);
    }
  }
  const specsSection = el("div", { class: "group" }, [
    el("h3", {}, "Specs"),
    treeNodes.length
      ? el("div", { class: "spec-tree" }, treeNodes)
      : el("p", { class: "empty" }, "No specs."),
  ]);
  return [group("Active changes", changeRows), specsSection];
}
