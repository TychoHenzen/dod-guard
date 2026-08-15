// render-spec.mjs - a spec, down to each requirement's scenarios.

import { el, firstLine } from "./dom.mjs";

function coverageLabel(entry) {
  if (entry) return el("span", { class: "cov-label cov-bound" }, entry.testName);
  return el("span", { class: "cov-label cov-unbound" }, "no test");
}

function scenarioItem(scenario, coverageEntry) {
  return el("li", { class: "scenario" }, [
    el("pre", {}, scenario.rawText ?? ""),
    coverageLabel(coverageEntry),
  ]);
}

function countBound(scenarios, coverage) {
  return scenarios.filter((s) => s.scenarioId && coverage[s.scenarioId]).length;
}

function covClass(bound, total) {
  if (total === 0) return "cov-count cov-none";
  if (bound === total) return "cov-count cov-full";
  if (bound > 0) return "cov-count cov-partial";
  return "cov-count cov-none";
}

function requirementBlock(requirement, index, coverage) {
  const scenarios = requirement.scenarios ?? [];
  const bound = countBound(scenarios, coverage);
  return el("details", { class: "req" }, [
    el("summary", {}, [
      el("span", { class: "req-num" }, index + 1),
      el("span", { class: "req-title" }, firstLine(requirement.text)),
      el("span", { class: covClass(bound, scenarios.length) }, `${bound}/${scenarios.length} bound`),
    ]),
    el("p", { class: "req-text" }, requirement.text ?? ""),
    scenarios.length
      ? el(
          "ul",
          { class: "scenarios" },
          scenarios.map((s) => scenarioItem(s, s.scenarioId ? coverage[s.scenarioId] : null)),
        )
      : el("p", { class: "empty" }, "No scenario is recorded for this requirement."),
  ]);
}

export function renderSpec(spec) {
  const requirements = spec.requirements ?? [];
  const coverage = spec.coverage ?? {};
  return el("article", { class: "detail" }, [
    el("h2", {}, spec.title ?? spec.id),
    el("p", { class: "meta" }, [
      `${requirements.length} requirements`,
      (() => {
        const allScenarios = requirements.flatMap((r) => r.scenarios ?? []);
        const total = allScenarios.length;
        if (total === 0) return null;
        const bound = countBound(allScenarios, coverage);
        return el("span", { class: covClass(bound, total) }, `, ${bound}/${total} scenarios bound`);
      })(),
    ]),
    spec.overview ? el("p", { class: "purpose" }, spec.overview) : null,
    requirements.length
      ? el(
          "div",
          { class: "reqs" },
          requirements.map((r, i) => requirementBlock(r, i, coverage)),
        )
      : el("p", { class: "empty" }, "This spec holds no requirements."),
  ]);
}
