// render-change.mjs - a change: progress, artifact states, deltas, tasks.
//
// Every task box is drawn as a state, never as an input, because the
// dashboard reads and never writes.

import { el, firstLine } from "./dom.mjs";

function progress(summary) {
  const total = summary?.totalTasks ?? 0;
  const done = summary?.completedTasks ?? 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return el("div", { class: "progress" }, [
    el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${percent}%` })),
    el("span", { class: "meta" }, `${done} of ${total} tasks done (${percent}%)`),
  ]);
}

function artifactChips(artifacts) {
  if (!artifacts.length) return null;
  const chips = artifacts.map((artifact) =>
    el("span", { class: `chip ${artifact.status}` }, `${artifact.id}: ${artifact.status}`),
  );
  return el("section", {}, [el("h3", {}, "Artifacts"), el("div", { class: "chips" }, chips)]);
}

function deltaItem(delta) {
  return el("li", { class: "delta" }, [
    el("span", { class: `op ${String(delta.operation).toLowerCase()}` }, delta.operation),
    el("span", {}, firstLine(delta.requirement?.text ?? delta.description ?? "")),
  ]);
}

function groupBySpec(deltas) {
  const groups = new Map();
  for (const delta of deltas) {
    if (!groups.has(delta.spec)) groups.set(delta.spec, []);
    groups.get(delta.spec).push(delta);
  }
  return groups;
}

function deltaSection(deltas) {
  if (!deltas.length) return el("section", {}, el("p", { class: "empty" }, "This change holds no spec deltas."));
  const groups = [...groupBySpec(deltas)].map(([spec, items]) =>
    el("div", { class: "group" }, [
      el("h4", {}, [spec, el("span", { class: "req-count" }, `${items.length}`)]),
      el("ul", { class: "deltas" }, items.map(deltaItem)),
    ]),
  );
  return el("section", {}, [el("h3", {}, `Deltas (${deltas.length})`), ...groups]);
}

function taskItem(task) {
  return el("li", { class: task.done ? "task done" : "task" }, [
    el("span", { class: "box", "aria-hidden": "true" }),
    el("span", { class: "task-id" }, task.id),
    el("span", {}, task.text),
  ]);
}

function taskSection(tasks) {
  if (!tasks) return el("section", {}, el("p", { class: "empty" }, "This change has no task file."));
  const groups = tasks.map((section) =>
    el("div", { class: "group" }, [
      el("h4", {}, section.title),
      el("ul", { class: "tasks" }, section.items.map(taskItem)),
    ]),
  );
  return el("section", {}, [el("h3", {}, `Tasks (${tasks.length} sections)`), ...groups]);
}

export function renderChange(data, summary) {
  const { detail, artifacts, tasks } = data;
  return el("article", { class: "detail" }, [
    el("h2", {}, detail.title ?? summary?.name ?? "Change"),
    progress(summary),
    artifactChips(artifacts ?? []),
    deltaSection(detail.deltas ?? []),
    taskSection(tasks),
  ]);
}
