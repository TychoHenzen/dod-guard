import assert from "node:assert/strict";
import test from "node:test";
import { createAdmin } from "../lib/project-admin.mjs";
import { discoverCodeExplorer, installedCodeExplorerRoot, loadCodeExplorer } from "../lib/code-explorer-launch.mjs";
import { createCodeExplorerManager } from "../lib/code-explorer-manager.mjs";
import { launchFailure, launchResult } from "../lib/launch-result.mjs";

function fileSystem(files) {
  const reads = [];
  const key = (path) => path.replaceAll("\\", "/");
  return {
    reads,
    realpath(path) {
      const normalized = key(path);
      if (!(normalized in files)) throw new Error(`missing ${path}`);
      return files[normalized].canonical ?? normalized;
    },
    stat(path) {
      const normalized = key(path);
      if (!(normalized in files)) throw new Error(`missing ${path}`);
      return { isFile: () => true };
    },
    readFile(path) {
      const normalized = key(path);
      reads.push(normalized);
      if (typeof files[normalized]?.text !== "string") throw new Error(`missing ${path}`);
      return files[normalized].text;
    },
  };
}

function packagedFiles(root) {
  return {
    [`${root}/dist/bundle.js`]: {},
    [`${root}/package.json`]: { text: '{"name":"code-explorer","main":"dist/bundle.js"}' },
    [`${root}/.claude-plugin/plugin.json`]: { text: '{"name":"code-explorer"}' },
  };
}

test("selects only a readable project from the matching registry snapshot", () => {
  const projects = [{ name: "one", path: "C:/projects/one" }];
  const admin = createAdmin({ get: () => ({ projects }) }, { isProject: () => true });
  const snapshot = admin.listProjects();
  assert.deepEqual(admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }), projects[0]);
  assert.throws(
    () => admin.selectLaunch(0, { registry_revision: "0".repeat(64) }),
    (error) => error.message === "stale_project_registry",
  );
});

test("discovers the validated monorepo bundle without reading project-local candidates", () => {
  const fs = fileSystem({
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    ...packagedFiles("C:/projects/untrusted/code-explorer"),
  });
  assert.equal(discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: {}, fs }), "C:/monorepo/packages/code-explorer/dist/bundle.js");
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/projects/")));
});

test("derives the installed Codex cache package from the tracked version", () => {
  const fs = fileSystem({ "C:/monorepo/packages/code-explorer/package.json": { text: '{"version":"0.1.2"}' } });
  assert.equal(
    installedCodeExplorerRoot({ monorepoRoot: "C:/monorepo", env: {}, fs, home: "C:/Users/me" }).replaceAll("\\", "/"),
    "C:/Users/me/.codex/plugins/cache/dod-guard-monorepo/code-explorer/0.1.2",
  );
});

test("loads only a bundle that exposes the import-safe embedded runtime", async () => {
  const createEmbeddedBrowserRuntime = () => {};
  assert.equal(
    await loadCodeExplorer("C:/trusted/dist/bundle.js", { importModule: async () => ({ createEmbeddedBrowserRuntime }) }),
    createEmbeddedBrowserRuntime,
  );
  await assert.rejects(
    loadCodeExplorer("C:/trusted/dist/bundle.js", { importModule: async () => ({}) }),
    (error) => error.message === "code_explorer_unavailable",
  );
});

function runtime(path, closed) {
  return { path, handle: async () => ({}), close: async () => closed.push(path) };
}

test("reuses one in-process runtime per project identity and isolates mounted routes", async () => {
  const closed = [];
  let starts = 0;
  const manager = createCodeExplorerManager({
    projectIdentity: (path) => path,
    origin: "http://127.0.0.1:4400",
    createId: () => `runtime-${++starts}`,
    start: ({ projectPath }) => runtime(projectPath, closed),
  });
  const one = await manager.launch("C:/projects/one");
  const reused = await manager.launch("C:/projects/one");
  const two = await manager.launch("C:/projects/two");
  assert.deepEqual(one, { state: "open", url: "http://127.0.0.1:4400/code-explorer/runtime-1/", reused: false });
  assert.equal(reused.reused, true);
  assert.notEqual(one.url, two.url);
  assert.equal(manager.resolve("/code-explorer/runtime-1/api/status").path, "/api/status");
  assert.equal(manager.resolve("/code-explorer/runtime-2/api/status").runtime.path, "C:/projects/two");
  assert.equal(manager.resolve("/code-explorer/unknown/api/status"), null);
  await manager.shutdown();
  assert.deepEqual(closed.sort(), ["C:/projects/one", "C:/projects/two"]);
  await assert.rejects(manager.launch("C:/projects/three"), (error) => error.message === "dashboard_shutting_down");
});

test("serializes concurrent idle eviction so runtime capacity stays bounded", async () => {
  let now = 0;
  const closed = [];
  const manager = createCodeExplorerManager({
    projectIdentity: (path) => path,
    origin: "http://127.0.0.1:4400",
    now: () => now,
    start: ({ projectPath }) => runtime(projectPath, closed),
  });
  await Promise.all(Array.from({ length: 8 }, (_, index) => manager.launch(`project-${index}`)));
  now = 1_800_001;
  await Promise.all([manager.launch("project-8"), manager.launch("project-9")]);
  assert.equal(manager.records().length, 8);
  assert.deepEqual(closed.sort(), ["project-0", "project-1"]);
  await manager.shutdown();
});

test("redacts runtime failures into the stable launch envelope", async () => {
  const failure = launchFailure(new Error("C:/secret TOKEN=value"));
  assert.deepEqual(failure, { code: "code_explorer_start_failed", message: "code_explorer_start_failed", retryable: true });
  assert.deepEqual(await launchResult(async () => { throw new Error("secret"); }), failure);
});
