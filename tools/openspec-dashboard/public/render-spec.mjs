// render-spec.mjs - a spec, down to each requirement's scenarios.

import { el, firstLine } from "./dom.mjs";

function scenarioItem(scenario) {
  return el("li", { class: "scenario" }, el("pre", {}, scenario.rawText ?? ""));
}

function requirementBlock(requirement, index) {
  const scenarios = requirement.scenarios ?? [];
  return el("details", { class: "req" }, [
    el("summary", {}, [
      el("span", { class: "req-num" }, index + 1),
      el("span", { class: "req-title" }, firstLine(requirement.text)),
      el("span", { class: "req-count" }, `${scenarios.length} scenarios`),
    ]),
    el("p", { class: "req-text" }, requirement.text ?? ""),
    scenarios.length
      ? el("ul", { class: "scenarios" }, scenarios.map(scenarioItem))
      : el("p", { class: "empty" }, "No scenario is recorded for this requirement."),
  ]);
}

export function renderSpec(spec) {
  const requirements = spec.requirements ?? [];
  return el("article", { class: "detail" }, [
    el("h2", {}, spec.title ?? spec.id),
    el("p", { class: "meta" }, `${requirements.length} requirements`),
    spec.overview ? el("p", { class: "purpose" }, spec.overview) : null,
    requirements.length
      ? el("div", { class: "reqs" }, requirements.map(requirementBlock))
      : el("p", { class: "empty" }, "This spec holds no requirements."),
  ]);
}
