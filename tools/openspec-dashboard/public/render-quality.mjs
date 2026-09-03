import { el } from "./dom.mjs";

const count = (value) => Number(value ?? 0).toLocaleString();
const score = (value) => Number(value ?? 0).toFixed(1);

function card(label, value, className = "") {
  return el("div", { class: `metric ${className}`.trim() }, [el("span", { class: "metric-value" }, value), el("span", {}, label)]);
}

function findingRow(finding) {
  const location = finding.line ? `:${finding.line}` : "";
  return el("li", { class: `finding ${finding.severity ?? "warn"}` }, [
    el("strong", {}, finding.rule ?? finding.kind ?? "finding"),
    el("code", {}, location),
    el("span", {}, finding.message ?? finding.reason ?? ""),
  ]);
}

function fileSection(file) {
  const findings = file.findings ?? [];
  return el("details", { class: "quality-file", open: file.errors > 0 || undefined }, [
    el("summary", {}, [
      el("code", {}, file.path),
      el("span", { class: "entry-note" }, `score ${score(file.score)} | ${count(file.errors)} errors | ${count(file.warnings)} warnings`),
    ]),
    findings.length ? el("ul", { class: "findings" }, findings.map(findingRow)) : el("p", { class: "empty" }, "No findings."),
  ]);
}

function architectureSection(architecture = {}) {
  const groups = Object.entries(architecture).filter(([, items]) => Array.isArray(items) && items.length);
  if (!groups.length) return el("p", { class: "empty" }, "No architecture findings.");
  return el("div", {}, groups.map(([name, items]) =>
    el("details", { class: "quality-file" }, [
      el("summary", {}, `${name} (${items.length})`),
      el("pre", { class: "architecture-json" }, JSON.stringify(items, null, 2)),
    ]),
  ));
}

export function renderQuality(report, filter = "") {
  const summary = report.summaries.overall;
  const needle = filter.toLowerCase();
  const files = report.files.filter((file) => !needle || file.path.toLowerCase().includes(needle) ||
    file.findings?.some((finding) => `${finding.rule} ${finding.message}`.toLowerCase().includes(needle)));
  return el("div", { class: "quality-report" }, [
    el("h1", {}, "Quality report"),
    el("div", { class: "metrics" }, [
      card("average score", score(summary.averageScore)),
      card("files", count(summary.fileCount)),
      card("errors", count(summary.errors), "error"),
      card("warnings", count(summary.warnings), "warn"),
    ]),
    el("h2", {}, `Files (${files.length})`),
    ...files.map(fileSection),
    el("h2", {}, "Architecture"),
    architectureSection(report.architecture),
  ]);
}
