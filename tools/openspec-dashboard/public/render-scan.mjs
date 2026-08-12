// render-scan.mjs - the panel that proposes projects and lets you keep some.
//
// A scan only proposes. Nothing reaches the registry until Add selected.

import { el } from "./dom.mjs";

function candidateRow(candidate) {
  const box = el("input", { type: "checkbox", value: candidate.path, disabled: candidate.registered });
  return el("label", { class: candidate.registered ? "candidate known" : "candidate" }, [
    box,
    el("span", { class: "path" }, candidate.path),
    candidate.registered ? el("span", { class: "chip done" }, "registered") : null,
  ]);
}

function selectedPaths(host) {
  return [...host.querySelectorAll("input[type=checkbox]:checked")].map((box) => box.value);
}

export function renderScan({ roots, candidates }, { onAdd, onRescan, projects, onRemove }) {
  const list = el(
    "div",
    { class: "candidates" },
    candidates.length ? candidates.map(candidateRow) : el("p", { class: "empty" }, "No project found."),
  );
  return el("article", { class: "detail" }, [
    el("h2", {}, "Projects"),
    el("p", { class: "meta" }, `Searched: ${roots.join(", ") || "no root configured"}`),
    list,
    el("div", { class: "row" }, [
      el("button", { type: "button", onclick: () => onAdd(selectedPaths(list)) }, "Add selected"),
      el("button", { type: "button", onclick: onRescan }, "Scan again"),
    ]),
    el("h3", {}, "Registered"),
    el(
      "ul",
      { class: "registered" },
      projects.map((project) =>
        el("li", {}, [
          el("span", { class: "path" }, project.path),
          !project.readable ? el("span", { class: "chip blocked" }, "missing") : null,
          el("button", { type: "button", onclick: () => onRemove(project.path) }, "Remove"),
        ]),
      ),
    ),
  ]);
}
