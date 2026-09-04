import assert from "node:assert/strict";
import test from "node:test";
import { buildQualityView } from "../public/quality-view.mjs";

const report = {
  schemaVersion: 1,
  summaries: { overall: { fileCount: 4, errors: 1, warnings: 3, averageScore: 93.75 } },
  files: [
    {
      path: "README.md",
      score: 100,
      errors: 0,
      warnings: 0,
      findings: [],
    },
    {
      path: "src/app.js",
      score: 80,
      errors: 1,
      warnings: 2,
      findings: [
        { severity: "error", rule: "no-eval", message: "Avoid eval" },
        { severity: "warn", rule: "complexity", message: "Function is complex" },
        { severity: "warn", rule: "no-console", message: "Avoid console" },
      ],
    },
    {
      path: "src/lib/util.js",
      score: 95,
      errors: 0,
      warnings: 1,
      findings: [{ severity: "warn", rule: "complexity", message: "Helper is complex" }],
    },
    {
      path: "test/app.test.js",
      score: 100,
      errors: 0,
      warnings: 0,
      findings: [],
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

  assert.deepEqual(view.summary, { fileCount: 4, errors: 1, warnings: 3, averageScore: 93.75 });
  assert.deepEqual(src.summary, { fileCount: 2, errors: 1, warnings: 3, averageScore: 87.5 });
  assert.equal(folder(view, "src/lib").children[0].path, "src/lib/util.js");
  assert.deepEqual(view.rules, ["complexity", "no-console", "no-eval"]);
});

test("combines text, severity, and rule filters", () => {
  const view = buildQualityView(report, { ...controls, text: "helper", severity: "warn", rule: "complexity" });

  assert.deepEqual(view.files.map((file) => file.path), ["src/lib/util.js"]);
  assert.deepEqual(view.summary, { fileCount: 1, errors: 0, warnings: 1, averageScore: 95 });
  assert.equal(view.files[0].findings.length, 1);
});

test("sorts visible files by path, score, errors, or warnings", () => {
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

  const errorView = buildQualityView(report, { ...controls, sort: "errors" });
  assert.equal(errorView.files[0].path, "src/app.js");
  assert.equal(errorView.tree[0].path, "src");

  const warningView = buildQualityView(report, { ...controls, sort: "warnings" });
  assert.deepEqual(warningView.files.slice(0, 2).map((file) => file.path), [
    "src/app.js",
    "src/lib/util.js",
  ]);
  assert.equal(warningView.tree[0].path, "src");
});

test("applies expand and collapse controls to visible folders", () => {
  assert.equal(folder(buildQualityView(report, controls), "src/lib").open, true);
  assert.equal(folder(buildQualityView(report, { ...controls, expanded: false }), "src/lib").open, false);
});

test("distinguishes empty reports from filters with no matches", () => {
  assert.equal(buildQualityView({ ...report, files: [] }, controls).emptyState, "No files in this report.");
  assert.equal(buildQualityView(report, { ...controls, text: "missing" }).emptyState, "No files match the active filters.");
});
