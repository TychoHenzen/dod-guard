import assert from "node:assert/strict";
import test from "node:test";
import { buildQualityView } from "../public/quality-view.mjs";

const report = {
  schemaVersion: 2,
  summaries: { overall: { fileCount: 4, high: 1, medium: 3, low: 1, averageScore: 93.75 } },
  files: [
    {
      path: "README.md",
      score: 100,
      high: 0,
      medium: 0,
      low: 0,
      findings: [],
    },
    {
      path: "src/app.js",
      score: 80,
      high: 1,
      medium: 2,
      low: 0,
      findings: [
        { severity: "high", rule: "no-eval", message: "Avoid eval" },
        { severity: "medium", rule: "complexity", message: "Function is complex" },
        { severity: "medium", rule: "no-console", message: "Avoid console" },
      ],
    },
    {
      path: "src/lib/util.js",
      score: 95,
      high: 0,
      medium: 1,
      low: 0,
      findings: [{ severity: "medium", rule: "complexity", message: "Helper is complex" }],
    },
    {
      path: "test/app.test.js",
      score: 100,
      high: 0,
      medium: 0,
      low: 1,
      findings: [{ severity: "low", rule: "todo-marker", message: "Resolve TODO" }],
    },
  ],
};

const controls = { text: "", severity: "all", rule: "all", sort: "path", expanded: true };

function folder(view, path) {
  const parts = path.split("/");
  let children = view.tree;
  let found;
  for (const part of parts) {
    found = children.find((node) => node.kind === "folder" && node.name === part);
    children = found?.children ?? [];
  }
  return found;
}

test("groups nested paths and aggregates visible summaries", () => {
  const view = buildQualityView(report, controls);
  const src = folder(view, "src");

  assert.deepEqual(view.summary, { fileCount: 4, high: 1, medium: 3, low: 1, averageScore: 93.75 });
  assert.deepEqual(src.summary, { fileCount: 2, high: 1, medium: 3, low: 0, averageScore: 87.5 });
  assert.equal(folder(view, "src/lib").children[0].path, "src/lib/util.js");
  assert.deepEqual(view.rules, ["complexity", "no-console", "no-eval", "todo-marker"]);
});

test("combines text, severity, and rule filters", () => {
  const view = buildQualityView(report, { ...controls, text: "helper", severity: "medium", rule: "complexity" });

  assert.deepEqual(view.files.map((file) => file.path), ["src/lib/util.js"]);
  assert.deepEqual(view.summary, { fileCount: 1, high: 0, medium: 1, low: 0, averageScore: 95 });
  assert.equal(view.files[0].findings.length, 1);
});

test("filters low findings separately", () => {
  const view = buildQualityView(report, { ...controls, severity: "low" });

  assert.deepEqual(view.files.map((file) => file.path), ["test/app.test.js"]);
  assert.deepEqual(view.summary, { fileCount: 1, high: 0, medium: 0, low: 1, averageScore: 100 });
});

test("sorts visible files by path, score, or severity count", () => {
  const pathView = buildQualityView(report, controls);
  assert.deepEqual(pathView.files.map((file) => file.path), [
    "README.md",
    "src/app.js",
    "src/lib/util.js",
    "test/app.test.js",
  ]);
  assert.deepEqual(pathView.tree.map((node) => node.path), ["README.md", "src", "test"]);

  const scoreView = buildQualityView(report, { ...controls, sort: "score" });
  assert.deepEqual(scoreView.files.map((file) => file.path), [
    "src/app.js",
    "src/lib/util.js",
    "README.md",
    "test/app.test.js",
  ]);
  assert.equal(scoreView.tree[0].path, "src");

  const highView = buildQualityView(report, { ...controls, sort: "high" });
  assert.equal(highView.files[0].path, "src/app.js");
  assert.equal(highView.tree[0].path, "src");

  const mediumView = buildQualityView(report, { ...controls, sort: "medium" });
  assert.deepEqual(mediumView.files.slice(0, 2).map((file) => file.path), [
    "src/app.js",
    "src/lib/util.js",
  ]);
  assert.equal(mediumView.tree[0].path, "src");

  const lowView = buildQualityView(report, { ...controls, sort: "low" });
  assert.equal(lowView.files[0].path, "test/app.test.js");
  assert.equal(lowView.tree[0].path, "test");
});

test("applies expand and collapse controls to visible folders", () => {
  assert.equal(folder(buildQualityView(report, controls), "src/lib").open, true);
  assert.equal(folder(buildQualityView(report, { ...controls, expanded: false }), "src/lib").open, false);
});

test("distinguishes empty reports from filters with no matches", () => {
  assert.equal(buildQualityView({ ...report, files: [] }, controls).emptyState, "No files in this report.");
  assert.equal(buildQualityView(report, { ...controls, text: "missing" }).emptyState, "No files match the active filters.");
});

test("includes unscored project findings in rules, filters, and severity totals", () => {
  const projectReport = {
    ...report,
    projectFindings: [
      {
        file: "<repository root>",
        line: 1,
        rule: "build-entrypoint",
        severity: "medium",
        message: "E1: no root entry point",
      },
    ],
  };
  const view = buildQualityView(projectReport, controls);

  assert.deepEqual(view.projectFindings.map((finding) => finding.rule), ["build-entrypoint"]);
  assert.deepEqual(view.summary, { fileCount: 4, high: 1, medium: 4, low: 1, averageScore: 93.75 });
  assert.ok(view.rules.includes("build-entrypoint"));
  assert.equal(buildQualityView(projectReport, { ...controls, severity: "high" }).projectFindings.length, 0);
  assert.equal(buildQualityView(projectReport, { ...controls, text: "repository root" }).projectFindings.length, 1);
  const ruleView = buildQualityView(projectReport, { ...controls, rule: "build-entrypoint" });
  assert.equal(ruleView.projectFindings.length, 1);
  assert.equal(ruleView.files.length, 0);
  assert.deepEqual(buildQualityView(report, controls).projectFindings, []);
});
