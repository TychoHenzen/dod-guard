import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodeExplorerManager } from "../lib/code-explorer-manager.mjs";
import { createDashboardOwnership, requestAuthenticatedShutdown, validateControlTarget, windowsAclEnvironment } from "../lib/dashboard-ownership.mjs";

test("passes only required host values to the Windows ACL adapter", () => {
  assert.deepEqual(windowsAclEnvironment("C:/private/owner.json", {
    SystemRoot: "C:/Windows",
    WINDIR: "C:/Windows",
    ComSpec: "C:/Windows/System32/cmd.exe",
    NODE_OPTIONS: "--require C:/injected.js",
    API_TOKEN: "secret",
    PATH: "C:/bin",
  }), {
    SystemRoot: "C:/Windows",
    WINDIR: "C:/Windows",
    ComSpec: "C:/Windows/System32/cmd.exe",
    OPENSPEC_DASHBOARD_ACL_PATH: "C:/private/owner.json",
  });
});

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeChild() {
  const listeners = new Map();
  return {
    exitCode: null,
    signalCode: null,
    killed: 0,
    once(name, listener) { listeners.set(name, listener); },
    kill() { this.killed += 1; },
    exit() { this.exitCode = 0; listeners.get("exit")?.(); },
  };
}
test("managed shutdown closes admission, signals every direct child, and waits for exit", async () => {
  const child = fakeChild();
  const manager = createCodeExplorerManager({ projectIdentity: (path) => path, start: async () => ({ child, url: "http://127.0.0.1:4410/" }) });
  await manager.launch("one");
  const stopping = manager.shutdown();
  assert.equal(child.killed, 1);
  await assert.rejects(manager.launch("two"), (error) => error.message === "dashboard_shutting_down");
  let settled = false;
  void stopping.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  child.exit();
  await stopping;
});
test("shutdown settles joined starts and terminates a child that reports after shutdown", async () => {
  const started = deferred();
  const child = fakeChild();
  const manager = createCodeExplorerManager({ projectIdentity: (path) => path, start: () => started.promise });
  const one = manager.launch("one");
  const two = manager.launch("one");
  const stopping = manager.shutdown();
  await assert.rejects(one, (error) => error.message === "dashboard_shutting_down");
  await assert.rejects(two, (error) => error.message === "dashboard_shutting_down");
  started.resolve({ child, url: "http://127.0.0.1:4410/" });
  await Promise.resolve();
  assert.equal(child.killed, 1);
  child.exit();
  await stopping;
});
test("authenticated replacement sends its capability only to a connected loopback owner", async () => {
  let received;
  const server = createServer((request, response) => {
    received = request.headers["x-openspec-dashboard-replacement-capability"];
    response.end("closed");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await requestAuthenticatedShutdown({ control_url: `http://127.0.0.1:${port}/api/admin/shutdown`, replacement_capability: "a".repeat(64) });
  assert.equal(received, "a".repeat(64));
  await new Promise((resolve) => server.close(resolve));
});
test("ownership refuses a linked dashboard directory and leaves it untouched", async () => {
  if (process.platform === "win32") return;
  const home = mkdtempSync(join(tmpdir(), "dashboard-owner-"));
  const outside = mkdtempSync(join(tmpdir(), "dashboard-owner-outside-"));
  try {
    symlinkSync(outside, join(home, ".openspec-dashboard"));
    const owner = createDashboardOwnership({ home });
    await assert.rejects(owner.claim({ control_url: "http://127.0.0.1:4400/api/admin/shutdown", replacement_capability: "a".repeat(64) }), /dashboard_replacement_failed/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
test("rejects unsafe control targets without attempting a request", async () => {
  for (const target of ["https://127.0.0.1:4400/api/admin/shutdown", "http://127.0.0.1:4400/other", "http://x@127.0.0.1:4400/api/admin/shutdown", "http://127.0.0.1:4400/api/admin/shutdown?x=1"]) {
    assert.equal(validateControlTarget(target), null);
    await assert.rejects(requestAuthenticatedShutdown({ control_url: target, replacement_capability: "a".repeat(64) }), /dashboard_replacement_failed/);
  }
});
test("fails closed when a prior owner cannot authenticate shutdown", async () => {
  const home = mkdtempSync(join(tmpdir(), "dashboard-owner-"));
  try {
    const platform = "win32";
    const verifyWindowsAcl = () => true;
    const owner = createDashboardOwnership({ home, platform, verifyWindowsAcl, requestShutdown: async () => { throw new Error("offline"); } });
    const first = createDashboardOwnership({ home, platform, verifyWindowsAcl });
    await first.claim({ control_url: "http://127.0.0.1:4400/api/admin/shutdown", replacement_capability: "a".repeat(64) });
    await assert.rejects(owner.claim({ control_url: "http://127.0.0.1:4401/api/admin/shutdown", replacement_capability: "b".repeat(64) }), /dashboard_replacement_failed/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reclaims a private ownership record after its recorded process exited", async () => {
  const home = mkdtempSync(join(tmpdir(), "dashboard-owner-"));
  try {
    const options = {
      home,
      platform: "win32",
      protectWindowsAcl: () => {},
      verifyWindowsAcl: () => true,
    };
    const first = createDashboardOwnership(options);
    await first.claim({ pid: 123, control_url: "http://127.0.0.1:4400/api/admin/shutdown", replacement_capability: "a".repeat(64) });
    const replacement = createDashboardOwnership({
      ...options,
      requestShutdown: async () => { throw new Error("offline"); },
      isProcessAlive: () => false,
    });

    await replacement.claim({ pid: 456, control_url: "http://127.0.0.1:4401/api/admin/shutdown", replacement_capability: "b".repeat(64) });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("writes ownership JSON through its exclusive descriptor and closes it once on every path", async () => {
  for (const writeFails of [false, true]) {
    const writes = [];
    const closes = [];
    const fs = {
      exists: () => false,
      realpath: (path) => path,
      mkdir: () => {},
      chmod: () => {},
      open: () => 71,
      write(descriptor, body) {
        writes.push([descriptor, body]);
        if (writeFails) throw new Error("write failure");
      },
      close: (descriptor) => closes.push(descriptor),
      lstat: (path) => ({ isSymbolicLink: () => false, isDirectory: () => !path.endsWith("dashboard-owner.json") }),
      stat: () => ({ uid: 1, mode: 0o100600 }),
      readFile: () => { throw new Error("unused"); },
      unlink: () => { throw new Error("must not remove a path after a failed proof"); },
      writeFile: () => { throw new Error("path write must not occur"); },
    };
    const owner = createDashboardOwnership({ home: "C:\\home", fs, platform: "win32", protectWindowsAcl: () => {}, verifyWindowsAcl: () => true });
    const claim = owner.claim({ control_url: "http://127.0.0.1:4400/api/admin/shutdown", replacement_capability: "a".repeat(64) });
    if (writeFails) await assert.rejects(claim, /dashboard_replacement_failed/);
    else await claim;
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], 71);
    assert.deepEqual(closes, [71]);
  }
});

test("hardens Windows ownership paths before verifying their ACL", async () => {
  let protectedAcl = false;
  const fs = {
    exists: () => false,
    realpath: (path) => path,
    mkdir: () => {},
    chmod: () => {},
    open: () => 71,
    write: () => {},
    close: () => {},
    lstat: (path) => ({ isSymbolicLink: () => false, isDirectory: () => !path.endsWith("dashboard-owner.json") }),
    stat: () => ({ uid: 1, mode: 0o100600 }),
    readFile: () => { throw new Error("unused"); },
    unlink: () => {},
  };
  const owner = createDashboardOwnership({
    home: "C:\\home",
    fs,
    platform: "win32",
    protectWindowsAcl: () => { protectedAcl = true; },
    verifyWindowsAcl: () => protectedAcl,
  });

  await owner.claim({
    control_url: "http://127.0.0.1:4400/api/admin/shutdown",
    replacement_capability: "a".repeat(64),
  });
  assert.equal(protectedAcl, true);
});

test("real fixture shutdown waits for its direct child and cleans its descendant", { timeout: 10_000 }, async () => {
  const parent = spawn(process.execPath, [join(import.meta.dirname, "fixtures", "process-tree-parent.mjs")], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const [line] = (await once(parent.stdout, "data"));
  const descendantPid = Number(String(line).trim());
  const manager = createCodeExplorerManager({ projectIdentity: (path) => path, start: async () => ({ child: parent, url: "http://127.0.0.1:4410/" }) });
  await manager.launch("fixture");
  const exited = once(parent, "exit");
  await manager.shutdown();
  const [code, signal] = await exited;
  assert.ok(code === 0 || signal === "SIGTERM");
  // Windows reports SIGTERM as process termination. Its child-tree cleanup is
  // owned by the packaged explorer, so this fixture proves no dashboard tree kill.
  if (process.platform !== "win32") assert.throws(() => process.kill(descendantPid, 0));
});
