import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function fixture() {
  const nodes = new Map();
  const pending = [];
  const load = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const context = {
    document: { getElementById: (id) => {
      const node = { children: [], disabled: false, addEventListener() {} };
      nodes.set(id, node);
      return node;
    } },
    api: { setDashboardCapability() {}, getQuality: load, refreshQuality: load },
    takeDashboardCapability: () => "",
    createCodeExplorerAction: () => ({ setRegistry() {} }),
    el: (tag, attrs, text) => ({ tag, text }),
    replace: (node, ...children) => { node.children = children; },
    renderTabs: () => [],
    renderQuality: (report, options) => {
      context.renderedOptions = options;
      return report;
    },
  };
  runInNewContext(source.replace(/^import .*;\r?\n/gm, "")
    .replace(/reloadProjects\(\)\.catch[^\n]+/, "")
    + '\nstate.projects = [{ path: "A" }, { path: "B" }];', context);
  return { context, nodes, pending };
}

test("project loading clears the old report and disables stale controls", async () => {
  const { context, nodes, pending } = fixture();
  const first = context.openProject(0);
  pending[0].resolve({ name: "old" });
  await first;
  const refresh = context.openProject(0, true);
  assert.equal(nodes.get("detail").children[0].text, "Regenerating quality report...");
  assert.equal(nodes.get("filter").disabled, true);
  assert.equal(nodes.get("refresh").disabled, true);
  pending[1].reject(new Error("scan failed"));
  await refresh;
  assert.equal(nodes.get("detail").children[0].text, "scan failed");
  assert.equal(nodes.get("filter").disabled, true);
  assert.equal(nodes.get("refresh").disabled, false);
});

for (const outcome of ["resolve", "reject"]) {
  test(`late refresh ${outcome} cannot replace the newly selected project`, async () => {
    const { context, nodes, pending } = fixture();
    const old = context.openProject(0, true);
    const current = context.openProject(1);
    const report = { name: "selected project" };
    pending[1].resolve(report);
    await current;
    pending[0][outcome](new Error("old request"));
    await old;
    assert.equal(nodes.get("detail").children[0], report);
    assert.equal(nodes.get("filter").disabled, false);
  });
}

test("opening project discovery prevents pending reports from replacing it", async () => {
  const { context, nodes, pending } = fixture();
  const old = context.openProject(0);
  await context.show(async () => "project discovery");
  pending[0].resolve({ name: "old" });
  await old;
  assert.deepEqual(nodes.get("detail").children, ["project discovery"]);
  assert.equal(nodes.get("refresh").disabled, true);
});

test("a rule absent from the next report resets to the displayed All rules option", async () => {
  const { context, pending } = fixture();
  context.updateQuality({ rule: "complexity" });
  const loading = context.openProject(1);
  pending[0].resolve({ files: [{ findings: [{ rule: "line-length" }] }] });
  await loading;
  assert.equal(context.renderedOptions.rule, "all");
});

test("returning to a refreshing project waits for its regenerated report", async () => {
  const { context, nodes, pending } = fixture();
  const refreshing = context.openProject(0, true);
  const other = context.openProject(1);
  pending[1].resolve({ name: "other" });
  await other;
  const returning = context.openProject(0);
  assert.equal(pending.length, 2, "must reuse the refresh instead of reading the old report");
  assert.equal(nodes.get("detail").children[0].text, "Regenerating quality report...");
  const report = { name: "regenerated" };
  pending[0].resolve(report);
  await Promise.all([refreshing, returning]);
  assert.equal(nodes.get("detail").children[0], report);
  assert.equal(nodes.get("refresh").disabled, false);
});
