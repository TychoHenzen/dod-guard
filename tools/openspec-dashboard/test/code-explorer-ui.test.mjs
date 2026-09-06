import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";
import { launchCodeExplorer, setDashboardCapability } from "../public/api.mjs";
import { takeDashboardCapability } from "../public/capability.mjs";
import { createCodeExplorerAction, selectedCodeExplorerAction } from "../public/code-explorer-action.mjs";

const registry = {
  registry_revision: "a".repeat(64),
  projects: [
    { id: 0, name: "readable", readable: true },
    { id: 1, name: "missing", readable: false },
  ],
};
test("keeps the fragment capability only in tab-scoped storage across a reload", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const replaced = [];
  const capability = "a".repeat(64);
  assert.equal(
    takeDashboardCapability(
      { hash: `#${capability}`, pathname: "/", search: "" },
      { replaceState: (...args) => replaced.push(args) },
      storage,
    ),
    capability,
  );
  assert.equal(takeDashboardCapability({ hash: "", pathname: "/", search: "" }, { replaceState() {} }, storage), capability);
  assert.equal(replaced.length, 1);
});
test("preserves a structured launch API error code", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => ({
    ok: false,
    statusText: "Forbidden",
    json: async () => ({ code: "invalid_dashboard_capability", message: "invalid_dashboard_capability" }),
  });
  setDashboardCapability("a".repeat(64));
  await assert.rejects(
    launchCodeExplorer({ index: 0, registryRevision: "b".repeat(64) }),
    (error) => error.message === "invalid_dashboard_capability",
  );
});
test("replaces a stale tab capability with the current dashboard process capability", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  let current = "c".repeat(64);
  const requests = [];
  globalThis.fetch = async (path, options) => {
    requests.push([path, options]);
    return {
      ok: true,
      json: async () => path === "/api/browser-capability" ? { capability: current } : { state: "open" },
    };
  };
  setDashboardCapability("a".repeat(64));
  await launchCodeExplorer({ index: 0, registryRevision: "b".repeat(64) });
  assert.equal(requests[1][1].headers["x-openspec-dashboard-capability"], current);
  current = "d".repeat(64);
  await launchCodeExplorer({ index: 0, registryRevision: "b".repeat(64) });
  assert.equal(requests[3][1].headers["x-openspec-dashboard-capability"], current);
});
test("retries once when the dashboard restarts between capability read and launch", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const first = "a".repeat(64);
  const replacement = "b".repeat(64);
  let request = 0;
  globalThis.fetch = async (path, options) => {
    request += 1;
    if (path === "/api/browser-capability") {
      return { ok: true, json: async () => ({ capability: request === 1 ? first : replacement }) };
    }
    if (request === 2) {
      return {
        ok: false,
        statusText: "Forbidden",
        json: async () => ({ code: "invalid_dashboard_capability" }),
      };
    }
    assert.equal(options.headers["x-openspec-dashboard-capability"], replacement);
    return { ok: true, json: async () => ({ state: "open" }) };
  };
  assert.deepEqual(await launchCodeExplorer({ index: 0, registryRevision: "c".repeat(64) }), { state: "open" });
  assert.equal(request, 4);
});
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
test("leaves an embedded runtime reusable when its placeholder closes during startup", async () => {
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
test("starts a later request so the server can replace a stale embedded runtime", async () => {
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

test("starts the dashboard and uses the same listener for the real Code Explorer browser path", async () => {
  const root = await mkdtemp(join(tmpdir(), "openspec-dashboard-live-"));
  const dashboardHome = join(root, "dashboard-home");
  const project = join(root, "project");
  const fakePackage = join(root, "code-explorer");
  const fakeBundle = join(fakePackage, "dist", "bundle.js");
  const realBundle = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "code-explorer", "dist", "bundle.js");
  const serve = resolve(dirname(fileURLToPath(import.meta.url)), "..", "serve.mjs");
  await mkdir(dashboardHome, { recursive: true });
  await mkdir(join(project, ".quality"), { recursive: true });
  await mkdir(join(fakePackage, "dist"), { recursive: true });
  await mkdir(join(fakePackage, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(project, ".quality", "quality-report.json"),
    JSON.stringify({
      schemaVersion: 1,
      summaries: { overall: { score: 1 } },
      files: [{ path: "src/main.ts", score: 1, findings: [] }],
    }),
  );
  await writeFile(join(dashboardHome, "projects.json"), JSON.stringify({
    roots: [],
    projects: [{ name: "live-fixture", path: project.replaceAll("\\", "/") }],
  }));
  const realBundleUrl = pathToFileURL(realBundle).href;
  await writeFile(join(fakePackage, "package.json"), JSON.stringify({ name: "code-explorer", main: "dist/bundle.js" }));
  await writeFile(join(fakePackage, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "code-explorer" }));
  await writeFile(
    fakeBundle,
    `import { createEmbeddedBrowserRuntime as realCreateEmbeddedBrowserRuntime } from ${JSON.stringify(realBundleUrl)};
function sourceView(symbolId, name, path, kind, body, handle, start, end, relations) {
  return {
    schema_version: 1,
    project_generation: 1,
    state: "ready",
    data: {
      view_id: "view-" + name,
      project_generation: 1,
      symbol_id: symbolId,
      name,
      path,
      kind,
      content: {
        body,
        truncated: false,
        limit_bytes: 32768,
        returned_bytes: Buffer.byteLength(body),
        total_bytes: Buffer.byteLength(body),
      },
      handles: handle ? [{ handle, name, symbol_id: symbolId, start, end, out_of_range: false, relations }] : [],
    },
  };
}
function targetCandidate(relation) {
  const body = "export const target = true;";
  return {
    relation,
    relation_source: "semantic",
    backend_name: "fixture",
    backend_version: "1",
    external: false,
    symbol_id: "symbol-target",
    display_name: "target",
    path: "src/target.ts",
    kind: "constant",
    view_id: "view-target",
    handle: "handle-target",
    project_generation: 1,
    handles: [{ handle: "handle-target", name: "target", symbol_id: "symbol-target", start: 13, end: 19, out_of_range: false, relations: [] }],
    content: {
      body,
      truncated: false,
      limit_bytes: 32768,
      returned_bytes: Buffer.byteLength(body),
      total_bytes: Buffer.byteLength(body),
    },
  };
}
const coreFactory = {
  async start() {
    return {
      async call(name, args) {
        if (name === "code_status" && args.action === "start_session") return { schema_version: 1, state: "ready", data: { session_id: "fixture-session" } };
        if (name === "code_status" && args.action === "status") return { schema_version: 1, state: "ready", data: {} };
        if (name === "code_status" && args.action === "refresh") return { schema_version: 1, state: "refreshed", data: {} };
        if (name === "code_search" && args.query === "") return { schema_version: 1, state: "ready", data: { landmarks: [{ group: "entry_points", symbols: [{ symbol_id: "symbol-main", name: "main", path: "src/main.ts", kind: "function" }] }] } };
        if (name === "code_focus" && args.symbol_id === "symbol-main") return sourceView("symbol-main", "main", "src/main.ts", "function", "export function main() { return 1; }", "handle-main", 16, 20, ["definition"]);
        if (name === "code_follow" && args.relation === "definition") return { schema_version: 1, state: "ready", data: { relation: args.relation, candidates: [targetCandidate(args.relation)] } };
        return { schema_version: 1, code: "invalid_request", message: "invalid_request", retryable: false };
      },
      async close() {},
    };
  },
};
export function createEmbeddedBrowserRuntime(options) {
  return realCreateEmbeddedBrowserRuntime({ ...options, core_factory: coreFactory });
}
`,
  );
  const port = await freePort();
  const child = spawn(process.execPath, [serve], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."),
    env: {
      ...process.env,
      CODE_EXPLORER_JS: fakeBundle,
      HOME: dashboardHome,
      OPENSPEC_DASHBOARD_HOME: dashboardHome,
      OPENSPEC_DASHBOARD_PORT: String(port),
      USERPROFILE: dashboardHome,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let browser;
  try {
    const dashboardUrl = await waitForDashboard(child, () => stdout, () => stderr);
    const dashboardOrigin = dashboardUrl.split("#", 1)[0];
    browser = await chromium.launch({ headless: true });
    const dashboard = await browser.newPage();
    await dashboard.goto(dashboardOrigin);
    await dashboard.locator("#code-explorer:enabled").waitFor();
    await dashboard.locator("#detail").getByText("main.ts", { exact: true }).waitFor();
    const popup = dashboard.waitForEvent("popup");
    await dashboard.locator("#code-explorer").click();
    const explorer = await popup;
    await explorer.waitForURL((url) => url.pathname.startsWith("/code-explorer/"));
    assert.equal(new URL(explorer.url()).port, new URL(dashboardOrigin).port);
    await explorer.locator('#code-explorer[data-state="ready"]').waitFor();
    await explorer.getByRole("button", { name: "main", exact: true }).click();
    await explorer.locator('.focused-source[data-view-id="view-main"]').waitFor();
    await explorer.locator('mark[data-handle="handle-main"]').click();
    await explorer.getByRole("button", { name: "definition", exact: true }).click();
    await explorer.locator('[data-pane="relations"][data-state="ready"]').waitFor();
    await explorer.getByRole("button", { name: "target", exact: true }).click();
    await explorer.locator('.focused-source[data-view-id="view-target"]').waitFor();
    await explorer.getByRole("button", { name: "Back", exact: true }).click();
    await explorer.locator('.focused-source[data-view-id="view-main"]').waitFor();
    await explorer.getByRole("button", { name: "Forward", exact: true }).click();
    await explorer.locator('.focused-source[data-view-id="view-target"]').waitFor();
    await explorer.getByRole("button", { name: "Refresh", exact: true }).click();
    await explorer.locator('[data-area="status"]').getByText("refreshed", { exact: true }).waitFor();
    assert.equal((stdout.match(/Quality dashboard on /g) ?? []).length, 1);
    const owner = JSON.parse(await readFile(join(dashboardHome, ".openspec-dashboard", "dashboard-owner.json"), "utf8"));
    const shutdown = await fetch(`${dashboardOrigin}api/admin/shutdown`, {
      method: "POST",
      headers: { "x-openspec-dashboard-replacement-capability": owner.replacement_capability },
    });
    assert.equal(shutdown.status, 200);
    const exited = await waitForExit(child);
    assert.equal(exited.code, 0, stderr);
  } finally {
    await browser?.close().catch(() => undefined);
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await waitForExit(child).catch(() => undefined);
    }
    await rm(root, { recursive: true, force: true });
  }
});

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function waitForDashboard(child, getStdout, getStderr) {
  const pattern = /Quality dashboard on (http:\/\/127\.0\.0\.1:\d+\/#(?:[0-9a-f]{64}))/u;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      callback(value);
    };
    const check = () => {
      const match = pattern.exec(getStdout());
      if (match) finish(resolve, match[1]);
    };
    const timer = setInterval(check, 25);
    const fail = (error) => finish(reject, error);
    child.once("error", fail);
    child.once("exit", (code, signal) => fail(new Error(`dashboard exited before startup: ${code ?? signal}\n${getStderr()}`)));
    check();
  });
}
