import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodeExplorerAction, selectedCodeExplorerAction } from "../public/code-explorer-action.mjs";

const registry = {
  registry_revision: "a".repeat(64),
  projects: [
    { id: 0, name: "readable", readable: true },
    { id: 1, name: "missing", readable: false },
  ],
};
test("enables Code Explorer for the selected readable registry entry", () => {
  assert.deepEqual(selectedCodeExplorerAction({ ...registry, active: 0 }), {
    disabled: false,
    index: 0,
    registryRevision: "a".repeat(64),
  });
});
test("disables Code Explorer for a selected missing entry without requesting launch", async () => {
  let requests = 0;
  const controller = createCodeExplorerAction({ request: async () => { requests += 1; } });
  controller.setRegistry({ ...registry, active: 1 });
  assert.equal(controller.renderState().disabled, true);
  await controller.launch();
  assert.equal(requests, 0);
});
test("captures the current selected index and revision when clicked", async () => {
  let request;
  const controller = createCodeExplorerAction({ windowPort: windowPort(), request: async (snapshot) => { request = snapshot; } });
  controller.setRegistry({ ...registry, active: 0 });
  controller.setRegistry({ ...registry, projects: [...registry.projects.slice(0, 1), { id: 1, name: "other", readable: true }], active: 1 });
  await controller.launch();
  assert.deepEqual(request, { index: 1, registryRevision: "a".repeat(64) });
});
test("closes the unused placeholder and renders fresh idle state after a stale response", async () => {
  const port = windowPort();
  const rendered = [];
  const fresh = { registry_revision: "b".repeat(64), projects: [{ id: 0, name: "fresh", readable: true }], active: 0 };
  const controller = createCodeExplorerAction({
    request: async () => ({ code: "stale_project_registry" }),
    reload: async () => fresh,
    render: (next) => rendered.push(next),
    windowPort: port,
  });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch();
  assert.equal(port.opened[0].closed, true);
  assert.deepEqual(controller.renderState(), { disabled: false, index: 0, registryRevision: "b".repeat(64), state: "idle" });
  assert.deepEqual(rendered.at(-1), controller.renderState());
});
test("disables Code Explorer when no project is registered", () => {
  assert.deepEqual(selectedCodeExplorerAction({ projects: [], registry_revision: "a".repeat(64), active: 0 }), {
    disabled: true,
    index: null,
    registryRevision: "a".repeat(64),
  });
});

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function windowPort() {
  const opened = [];
  return {
    opened,
    openBlank() {
      const handle = {
        closed: false,
        close() {
          this.closed = true;
        },
        location: { replace: (url) => { handle.url = url; } },
      };
      opened.push(handle);
      return handle;
    },
  };
}
test("opens a blank tab before requesting, then navigates only its captured handle", async () => {
  const calls = [];
  const port = windowPort();
  const controller = createCodeExplorerAction({
    windowPort: port,
    request: async (snapshot) => {
      calls.push({ type: "request", snapshot });
      return { state: "open", url: "http://127.0.0.1:4410/" };
    },
  });
  controller.setRegistry({ ...registry, active: 0 });
  const launch = controller.launch();
  assert.equal(port.opened.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].snapshot, { index: 0, registryRevision: "a".repeat(64) });
  await launch;
  assert.equal(port.opened[0].url, "http://127.0.0.1:4410/");
  assert.equal(controller.renderState().state, "open");
});
test("closes an unused placeholder and retains a stable failure for retry", async () => {
  const port = windowPort();
  const controller = createCodeExplorerAction({ windowPort: port, request: async () => ({ code: "code_explorer_start_failed" }) });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch();
  assert.equal(port.opened[0].closed, true);
  assert.deepEqual(controller.renderState(), {
    disabled: false,
    index: 0,
    registryRevision: "a".repeat(64),
    state: "failed",
    code: "code_explorer_start_failed",
  });
});

test("keeps a server error redacted when the request rejects", async () => {
  const controller = createCodeExplorerAction({
    windowPort: windowPort(),
    request: async () => {
      throw new Error("C:/projects/one TOKEN=secret");
    },
  });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch();
  assert.equal(controller.renderState().code, "code_explorer_start_failed");
});
test("reports a blocked browser tab without requesting launch", async () => {
  let requests = 0;
  const controller = createCodeExplorerAction({ windowPort: { openBlank: () => null }, request: async () => { requests += 1; } });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch();
  assert.equal(requests, 0);
  assert.equal(controller.renderState().code, "browser_tab_blocked");
});
test("leaves a managed child reusable when its placeholder closes during startup", async () => {
  const pending = deferred();
  const port = windowPort();
  const controller = createCodeExplorerAction({ windowPort: port, request: () => pending.promise });
  controller.setRegistry({ ...registry, active: 0 });
  const launch = controller.launch();
  port.opened[0].closed = true;
  pending.resolve({ state: "open", url: "http://127.0.0.1:4410/" });
  await launch;
  assert.equal(controller.renderState().code, "browser_tab_closed");
  await controller.launch();
  assert.equal(port.opened.length, 2);
});
test("suppresses a duplicate click while the selected snapshot is starting", async () => {
  const pending = deferred();
  const port = windowPort();
  let requests = 0;
  const controller = createCodeExplorerAction({ windowPort: port, request: () => { requests += 1; return pending.promise; } });
  controller.setRegistry({ ...registry, active: 0 });
  void controller.launch();
  await controller.launch();
  assert.equal(requests, 1);
  assert.equal(port.opened.length, 1);
  pending.resolve({ code: "code_explorer_start_failed" });
});
test("never rebinds a late result to a new selection", async () => {
  const pending = deferred();
  const port = windowPort();
  const controller = createCodeExplorerAction({ windowPort: port, request: () => pending.promise });
  controller.setRegistry({ ...registry, active: 0 });
  const launch = controller.launch();
  controller.setRegistry({ ...registry, projects: [registry.projects[0], { ...registry.projects[1], readable: true }], active: 1 });
  pending.resolve({ state: "open", url: "http://127.0.0.1:4411/" });
  await launch;
  assert.equal(port.opened[0].url, "http://127.0.0.1:4411/");
  assert.equal(controller.renderState().index, 1);
  assert.equal(controller.renderState().state, "idle");
});
test("starts a later request so the server can replace a stale managed child", async () => {
  const port = windowPort();
  const results = [
    { state: "open", url: "http://127.0.0.1:4410/", reused: false },
    { state: "open", url: "http://127.0.0.1:4411/", reused: false },
  ];
  const controller = createCodeExplorerAction({ windowPort: port, request: async () => results.shift() });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch();
  await controller.launch();
  assert.equal(port.opened[1].url, "http://127.0.0.1:4411/");
});
test("launch action leaves registered-project fixture content unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "openspec-dashboard-ui-"));
  const projectFile = join(root, "tasks.md");
  await writeFile(projectFile, "- [ ] unchanged\n");
  const before = createHash("sha256").update(await readFile(projectFile)).digest("hex");
  const controller = createCodeExplorerAction({
    windowPort: windowPort(),
    request: async () => ({ state: "open", url: "http://127.0.0.1:4410/" }),
  });
  controller.setRegistry({ ...registry, active: 0, projects: [{ ...registry.projects[0], path: root }, registry.projects[1]] });
  await controller.launch();
  const after = createHash("sha256").update(await readFile(projectFile)).digest("hex");
  assert.equal(after, before);
});
