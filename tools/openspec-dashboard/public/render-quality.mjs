import { el } from "./dom.mjs";
import { buildQualityView } from "./quality-view.mjs";

const count = (value) => Number(value ?? 0).toLocaleString();
function score(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return Number(value).toFixed(1);
}

function card(label, value, className = "") {
  return el("div", { class: `metric ${className}`.trim() }, [el("span", { class: "metric-value" }, value), el("span", {}, label)]);
}

function summaryText(summary) {
  let fileLabel = "files";
  if (summary.fileCount === 1) {
    fileLabel = "file";
  }
  return `${count(summary.fileCount)} ${fileLabel} | score ${score(summary.averageScore)} | ${count(summary.errors)} errors | ${count(summary.warnings)} warnings`;
}

function findingRow(finding) {
  let location = "";
  if (finding.line) {
    location = `:${finding.line}`;
  }
  return el("li", { class: `finding ${finding.severity ?? "warn"}` }, [
    el("strong", {}, finding.rule ?? finding.kind ?? "finding"),
    el("code", {}, location),
    el("span", {}, finding.message ?? finding.reason ?? ""),
  ]);
}

function fileSection(file) {
  let findings = el("p", { class: "empty" }, "No findings match the active filters.");
  if (file.findings.length > 0) {
    findings = el("ul", { class: "findings" }, file.findings.map(findingRow));
  }
  return el("details", { class: "quality-file", open: file.errors > 0 || undefined }, [
    el("summary", {}, [
      el("code", {}, file.name),
      el("span", { class: "entry-note" }, summaryText(file.summary)),
    ]),
    findings,
  ]);
}

function renderTreeNode(node, callbacks) {
  if (node.kind === "folder") {
    return folderSection(node, callbacks);
  }
  return fileSection(node);
}

function folderSection(folder, callbacks) {
  return el("details", {
    class: "quality-folder",
    open: folder.open || undefined,
    ontoggle: (event) => callbacks.onFolderToggle(folder.path, event.currentTarget.open),
  }, [
    el("summary", { class: "quality-summary" }, [
      el("strong", {}, folder.name),
      el("span", { class: "entry-note" }, summaryText(folder.summary)),
    ]),
    el("div", { class: "quality-children" }, folder.children.map((child) => renderTreeNode(child, callbacks))),
  ]);
}

function selectControl(label, value, values, onchange) {
  return el("label", { class: "quality-control" }, [
    el("span", {}, label),
    el("select", { onchange: (event) => onchange(event.target.value) }, values.map(([optionValue, text]) =>
      el("option", { value: optionValue, selected: optionValue === value || undefined }, text))),
  ]);
}

function controlsSection(view, callbacks) {
  const rules = [["all", "All rules"], ...view.rules.map((rule) => [rule, rule])];
  return el("div", { class: "quality-controls" }, [
    selectControl("Severity", view.controls.severity, [["all", "All severities"], ["error", "Errors"], ["warn", "Warnings"]], callbacks.onSeverity),
    selectControl("Rule", view.controls.rule, rules, callbacks.onRule),
    selectControl("Sort", view.controls.sort, [["path", "Path"], ["score", "Lowest score"], ["errors", "Most errors"], ["warnings", "Most warnings"]], callbacks.onSort),
    el("div", { class: "quality-expansion" }, [
      el("button", { type: "button", onclick: () => callbacks.onExpand(true) }, "Expand all"),
      el("button", { type: "button", onclick: () => callbacks.onExpand(false) }, "Collapse all"),
    ]),
  ]);
}

function architectureSection(architecture = {}) {
  const groups = Object.entries(architecture).filter(([, items]) => Array.isArray(items) && items.length > 0);
  if (groups.length === 0) {
    return el("p", { class: "empty" }, "No architecture findings.");
  }
  return el("div", {}, groups.map(([name, items]) =>
    el("details", { class: "quality-file" }, [
      el("summary", {}, `${name} (${items.length})`),
      el("pre", { class: "architecture-json" }, JSON.stringify(items, null, 2)),
    ])));
}

const ignore = () => undefined;
const noCallbacks = {
  onSeverity: ignore,
  onRule: ignore,
  onSort: ignore,
  onExpand: ignore,
  onFolderToggle: ignore,
};

export function renderQuality(report, options = {}, suppliedCallbacks = {}) {
  let normalizedOptions = options;
  if (typeof options === "string") {
    normalizedOptions = { text: options };
  }
  const callbacks = { ...noCallbacks, ...suppliedCallbacks };
  const view = buildQualityView(report, normalizedOptions);
  let fileTree = el("div", { class: "quality-tree" }, view.tree.map((node) => renderTreeNode(node, callbacks)));
  if (view.emptyState) {
    fileTree = el("p", { class: "empty" }, view.emptyState);
  }
  return el("div", { class: "quality-report" }, [
    el("h1", {}, "Quality report"),
    el("div", { class: "metrics" }, [
      card("average score", score(view.summary.averageScore)),
      card("visible files", count(view.summary.fileCount)),
      card("errors", count(view.summary.errors), "error"),
      card("warnings", count(view.summary.warnings), "warn"),
    ]),
    controlsSection(view, callbacks),
    el("h2", {}, `Files (${view.files.length})`),
    fileTree,
    el("h2", {}, "Architecture"),
    architectureSection(report.architecture),
  ]);
}
