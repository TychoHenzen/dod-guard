import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { PassThrough } from "node:stream";
import { createAdmin } from "../lib/project-admin.mjs";
import {
  discoverCodeExplorer,
  installedCodeExplorerRoot,
  spawnCodeExplorer,
  startCodeExplorer,
} from "../lib/code-explorer-launch.mjs";
import { assertLaunchRequest, createCapabilities, readLaunchBody } from "../lib/launch-http.mjs";
import { createReadinessParser, validateExplorerUrl } from "../lib/readiness.mjs";
import { createCodeExplorerManager, probeCodeExplorer } from "../lib/code-explorer-manager.mjs";
import { launchFailure, launchResult } from "../lib/launch-result.mjs";
import { createProjectIdentity } from "../lib/project-identity.mjs";

function storeFor(projects) {
  return { get: () => ({ projects }) };
}

function launchSnapshot(projects, readablePaths = new Set(projects.map((project) => project.path))) {
  const admin = createAdmin(storeFor(projects), { isProject: (path) => readablePaths.has(path) });
  return { admin, snapshot: admin.listProjects() };
}
test("selects only the current registered canonical project path", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.deepEqual(admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }), {
    name: "one",
    path: "C:/projects/one",
  });
});
test("rejects inserted, removed, and reordered registry snapshots before index selection", () => {
  const projects = [
    { name: "one", path: "C:/projects/one" },
    { name: "two", path: "C:/projects/two" },
  ];
  const admin = createAdmin(storeFor(projects), { isProject: () => true });
  const revision = admin.listProjects().registry_revision;
  for (const changed of [
    [{ name: "new", path: "C:/projects/new" }, ...projects],
    [projects[0]],
    [...projects].reverse(),
  ]) {
    const changedAdmin = createAdmin(storeFor(changed), { isProject: () => true });
    assert.throws(
      () => changedAdmin.selectLaunch(0, { registry_revision: revision }),
      (error) => error.message === "stale_project_registry",
    );
  }
});
test("rejects path-like and unknown request fields before selecting a registry entry", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  for (const body of [
    { registry_revision: snapshot.registry_revision, path: "C:/elsewhere" },
    { registry_revision: snapshot.registry_revision, root: "C:/elsewhere" },
    { registry_revision: snapshot.registry_revision, command: "node" },
    { registry_revision: snapshot.registry_revision, unexpected: true },
  ]) {
    assert.throws(() => admin.selectLaunch(0, body), (error) => error.message === "invalid_launch_request");
  }
});
test("rejects a missing index from a matching registry snapshot", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.throws(
    () => admin.selectLaunch(1, { registry_revision: snapshot.registry_revision }),
    (error) => error.message === "project_not_registered",
  );
});
test("rejects an unreadable matching registry entry", () => {
  const projects = [{ name: "one", path: "C:/projects/one" }];
  const { admin, snapshot } = launchSnapshot(projects, new Set());
  assert.throws(
    () => admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }),
    (error) => error.message === "project_unavailable",
  );
});

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
      if (!(normalized in files) || files[normalized].directory) throw new Error(`not a file ${path}`);
      return { isFile: () => true };
    },
    readFile(path) {
      const normalized = key(path);
      reads.push(normalized);
      if (!(normalized in files) || typeof files[normalized].text !== "string") throw new Error(`missing ${path}`);
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
test("freezes a valid override without inspecting the fallback", () => {
  const fs = fileSystem(packagedFiles("C:/cache/code-explorer"));
  const entry = discoverCodeExplorer({
    monorepoRoot: "C:/monorepo",
    env: { CODE_EXPLORER_JS: "C:/cache/code-explorer/dist/bundle.js" },
    fs,
  });
  assert.equal(entry, "C:/cache/code-explorer/dist/bundle.js");
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/monorepo/")));
});
test("freezes the valid monorepo bundle when no override is set", () => {
  const fs = fileSystem({
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    ...packagedFiles("C:/cache/code-explorer/0.1.2"),
  });
  assert.equal(
    discoverCodeExplorer({ monorepoRoot: "C:/monorepo", installedRoot: "C:/cache/code-explorer/0.1.2", env: {}, fs }),
    "C:/monorepo/packages/code-explorer/dist/bundle.js",
  );
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/cache/")));
});
test("discovers the supported installed Codex cache package when the monorepo bundle is absent", () => {
  const installedRoot = "C:/Users/me/.codex/plugins/cache/dod-guard-monorepo/code-explorer/0.1.2";
  const fs = fileSystem({
    "C:/shipped-dashboard/packages/code-explorer/package.json": { text: '{"version":"0.1.2"}' },
    ...packagedFiles(installedRoot),
  });
  assert.equal(
    discoverCodeExplorer({ monorepoRoot: "C:/shipped-dashboard", env: { CODEX_HOME: "C:/Users/me/.codex" }, fs }),
    `${installedRoot}/dist/bundle.js`,
  );
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/projects/")));
});
test("derives the installed Codex cache package from the tracked plugin version", () => {
  const root = "C:/monorepo";
  const fs = fileSystem({
    [`${root}/packages/code-explorer/package.json`]: { text: '{"version":"0.1.2"}' },
  });
  const installed = installedCodeExplorerRoot({ monorepoRoot: root, env: {}, fs, home: "C:/Users/me" });
  assert.equal(installed.replaceAll("\\", "/"), "C:/Users/me/.codex/plugins/cache/dod-guard-monorepo/code-explorer/0.1.2");
});
test("rejects invalid override metadata without falling back or spawning", () => {
  const files = {
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    "C:/cache/code-explorer/dist/bundle.js": {},
    "C:/cache/code-explorer/package.json": { text: '{"name":"other","main":"dist/bundle.js"}' },
    "C:/cache/code-explorer/.claude-plugin/plugin.json": { text: '{"name":"code-explorer"}' },
  };
  const fs = fileSystem(files);
  assert.throws(
    () =>
      discoverCodeExplorer({
        monorepoRoot: "C:/monorepo",
        installedRoot: "C:/cache/code-explorer/0.1.2",
        env: { CODE_EXPLORER_JS: "C:/cache/code-explorer/dist/bundle.js" },
        fs,
      }),
    (error) => error.message === "code_explorer_unavailable",
  );
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/monorepo/")));
  assert.throws(
    () => discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: { CODE_EXPLORER_JS: "" }, fs }),
    (error) => error.message === "code_explorer_unavailable",
  );
});
test("ignores project-local executable candidates", () => {
  const fs = fileSystem({
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    ...packagedFiles("C:/projects/untrusted/code-explorer"),
  });
  const entry = discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: {}, fs });
  assert.equal(entry, "C:/monorepo/packages/code-explorer/dist/bundle.js");
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/projects/")));
});
test("spawns the fixed Node command with only the allowlisted environment", () => {
  let call;
  const child = { stdout: {}, stderr: {} };
  const result = spawnCodeExplorer({
    entry: "C:/trusted/dist/bundle.js",
    projectPath: "C:/projects/one",
    monorepoRoot: "C:/monorepo",
    env: { PATH: "C:/bin", HOME: "C:/home", NODE_OPTIONS: "--inspect", API_TOKEN: "secret", CODE_EXPLORER_JS: "other" },
    execPath: "C:/node/node.exe",
    spawn(...args) {
      call = args;
      return child;
    },
  });
  assert.equal(result, child);
  assert.deepEqual(call, [
    "C:/node/node.exe",
    ["C:/trusted/dist/bundle.js", "serve", "--project-root", "C:/projects/one", "--no-open"],
    {
      cwd: "C:/monorepo",
      env: { PATH: "C:/bin", HOME: "C:/home" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  ]);
});
test("passes shell metacharacters as one inert project-root argument", () => {
  let call;
  const projectPath = 'C:/projects/a & "b"; $(whoami)';
  spawnCodeExplorer({
    entry: "C:/trusted/dist/bundle.js",
    projectPath,
    monorepoRoot: "C:/monorepo",
    env: {},
    spawn(...args) {
      call = args;
      return {};
    },
  });
  assert.equal(call[1][3], projectPath);
  assert.equal(call[2].shell, false);
});
test("drops credentials, Node injection, overrides, and project values from the child environment", () => {
  let options;
  spawnCodeExplorer({
    entry: "C:/trusted/dist/bundle.js",
    projectPath: "C:/projects/secret",
    monorepoRoot: "C:/monorepo",
    env: {
      PATH: "C:/bin",
      SystemRoot: "C:/Windows",
      NODE_OPTIONS: "--require C:/evil.js",
      NODE_PATH: "C:/modules",
      npm_config_userconfig: "C:/token",
      GITHUB_TOKEN: "secret",
      CODE_EXPLORER_JS: "C:/override.js",
      PROJECT_ROOT: "C:/projects/secret",
    },
    spawn(_executable, _args, receivedOptions) {
      options = receivedOptions;
      return {};
    },
  });
  assert.deepEqual(options.env, { PATH: "C:/bin", SystemRoot: "C:/Windows" });
});

test("waits for bounded readiness before returning the spawned child", async () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = { stdout, stderr, once() {}, kill() {} };
  const launched = startCodeExplorer({
    entry: "C:/trusted/dist/bundle.js",
    projectPath: "C:/project",
    monorepoRoot: "C:/monorepo",
    env: {},
    spawn: () => child,
  });
  stdout.emit("data", Buffer.from("Code Explorer: http://127.0.0.1:4410/\n"));
  assert.deepEqual(await launched, { child, url: "http://127.0.0.1:4410/" });
});
test("reports safe failure stages without changing the public error", async () => {
  for (const [result, stage] of [
    [{ error: "invalid_code_explorer_url" }, "invalid_url"],
    [{ error: "code_explorer_start_timeout" }, "readiness_timeout"],
    [{ error: "code_explorer_start_failed" }, "readiness_failed"],
  ]) {
    const reports = [];
    const stream = new EventEmitter();
    const child = { stdout: stream, stderr: new EventEmitter(), once() {}, kill() {} };
    const launched = startCodeExplorer({
      entry: "C:/trusted/dist/bundle.js",
      projectPath: "C:/project",
      monorepoRoot: "C:/monorepo",
      spawn: () => child,
      createParser: () => ({ feed: () => result }),
      report: (value) => reports.push(value),
    });
    stream.emit("data", Buffer.from("redacted child output"));
    await assert.rejects(launched, (error) => error.message === result.error);
    assert.deepEqual(reports, [stage]);
  }
});

function launchRequest(overrides = {}) {
  return {
    method: "POST",
    urlPath: "/api/project/0/code-explorer",
    headers: {
      host: "127.0.0.1:4400",
      origin: "http://127.0.0.1:4400",
      "content-type": "application/json",
      "x-openspec-dashboard-capability": "a".repeat(64),
      ...overrides,
    },
  };
}

const launchAuthority = { capability: "a".repeat(64), host: "127.0.0.1:4400", origin: "http://127.0.0.1:4400" };
test("accepts only a generated 256-bit browser capability on the fixed launch route", () => {
  const caps = createCapabilities((bytes) => Buffer.alloc(bytes, 1));
  assert.equal(caps.browser, "01".repeat(32));
  assert.equal(caps.replacement, "01".repeat(32));
  assertLaunchRequest(launchRequest(), launchAuthority);
});
test("rejects another origin, missing origin, host mismatch, and preflight before body work", () => {
  for (const request of [
    launchRequest({ origin: "http://evil.invalid" }),
    launchRequest({ origin: undefined }),
    launchRequest({ host: "localhost:4400" }),
    { ...launchRequest(), method: "OPTIONS" },
  ]) {
    assert.throws(() => assertLaunchRequest(request, launchAuthority), (error) => error.message === "invalid_launch_request");
  }
});
test("rejects missing and guessed capabilities before the body is read", () => {
  for (const capability of [undefined, "b".repeat(64), "a".repeat(63)]) {
    assert.throws(
      () => assertLaunchRequest(launchRequest({ "x-openspec-dashboard-capability": capability }), launchAuthority),
      (error) => error.message === "invalid_dashboard_capability",
    );
  }
});
test("stops at 1 KiB of received body bytes before parsing", async () => {
  const body = new PassThrough();
  const outcome = readLaunchBody(body);
  body.write(Buffer.alloc(1024));
  body.write(Buffer.from("x"));
  await assert.rejects(outcome, (error) => error.message === "launch_request_limit");
  assert.equal(body.isPaused(), true);
});
test("rejects another route method and non-JSON content type at the HTTP boundary", () => {
  for (const request of [
    { ...launchRequest(), method: "GET" },
    launchRequest({ "content-type": "application/json; charset=utf-8" }),
    { ...launchRequest(), urlPath: "/api/project/0/code-explorer/else" },
  ]) {
    assert.throws(() => assertLaunchRequest(request, launchAuthority), (error) => error.message === "invalid_launch_request");
  }
});
test("parses a CRLF readiness line split across arbitrary UTF-8 chunks", () => {
  let time = 0;
  const parser = createReadinessParser({ now: () => time });
  assert.equal(parser.feed("stdout", Buffer.from("Code Expl")), null);
  assert.equal(parser.feed("stdout", Buffer.from("orer: http://127.0.0.1:4410/\r")), null);
  assert.deepEqual(parser.feed("stdout", Buffer.from("\n")), { url: "http://127.0.0.1:4410/", state: "open" });
  time = 29_999;
  assert.deepEqual(parser.deadline(), { url: "http://127.0.0.1:4410/", state: "open" });
});
test("rejects every readiness URL outside the exact loopback contract", () => {
  for (const url of ["https://127.0.0.1:4410/", "http://localhost:4410/", "http://127.0.0.1:4409/", "http://127.0.0.1:4410/x", "http://u@127.0.0.1:4410/"]) {
    const parser = createReadinessParser();
    assert.deepEqual(parser.feed("stderr", Buffer.from(`Code Explorer: ${url}\n`)), { error: "invalid_code_explorer_url" });
    assert.equal(validateExplorerUrl(url), null);
  }
});
test("does not treat a partial final line or child exit as readiness", () => {
  const parser = createReadinessParser();
  parser.feed("stdout", Buffer.from("Code Explorer: http://127.0.0.1:4410/"));
  assert.deepEqual(parser.end(), { error: "code_explorer_start_failed" });
});
test("expires at the exact 30-second monotonic deadline", () => {
  let time = 0;
  const parser = createReadinessParser({ now: () => time });
  time = 29_999;
  assert.equal(parser.deadline(), null);
  time = 30_000;
  assert.deepEqual(parser.deadline(), { error: "code_explorer_start_timeout" });
});
test("counts each stream before decoding across chunk shapes", () => {
  for (const chunks of [[65_536], [1, 65_535]]) {
    const parser = createReadinessParser();
    for (const size of chunks) assert.equal(parser.feed("stdout", Buffer.alloc(size)), null);
    assert.deepEqual(parser.feed("stdout", Buffer.from("x")), { error: "code_explorer_output_limit" });
  }
  const separateStreams = createReadinessParser();
  assert.equal(separateStreams.feed("stdout", Buffer.alloc(65_536)), null);
  assert.equal(separateStreams.feed("stderr", Buffer.alloc(65_536)), null);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function child() {
  return { exitCode: null, signalCode: null };
}

function lifecycle({ now = () => 0, start, probe = async () => true, stop = async () => {}, identity = (path) => path } = {}) {
  return createCodeExplorerManager({ now, start, probe, stop, projectIdentity: identity });
}
test("coalesces racing starts for the same canonical path and filesystem identity", async () => {
  const pending = deferred();
  let starts = 0;
  const manager = lifecycle({
    start: () => {
      starts += 1;
      return pending.promise;
    },
  });
  const first = manager.launch("C:/projects/one");
  const second = manager.launch("C:/projects/one");
  assert.equal(starts, 1);
  pending.resolve({ child: child(), url: "http://127.0.0.1:4410/" });
  assert.deepEqual(await first, { state: "open", url: "http://127.0.0.1:4410/", reused: false });
  assert.deepEqual(await second, { state: "open", url: "http://127.0.0.1:4410/", reused: false });
});
test("reuses only a live child after an exact successful root probe", async () => {
  let starts = 0;
  let probes = 0;
  const managedChild = child();
  const manager = lifecycle({
    start: () => {
      starts += 1;
      return { child: managedChild, url: "http://127.0.0.1:4410/" };
    },
    probe: async (url) => {
      probes += 1;
      assert.equal(url, "http://127.0.0.1:4410/");
      return true;
    },
  });
  assert.equal((await manager.launch("C:/projects/one")).reused, false);
  assert.deepEqual(await manager.launch("C:/projects/one"), { state: "open", url: "http://127.0.0.1:4410/", reused: true });
  assert.equal(starts, 1);
  assert.equal(probes, 1);
});
test("replaces records when the direct probe rejects redirects, another address, overflow, timeout, or another status", async () => {
  for (const probe of [false, async () => { throw new Error("redirect"); }]) {
    let starts = 0;
    let stopped = 0;
    const manager = lifecycle({
      start: () => ({ child: child(), url: `http://127.0.0.1:${4410 + starts++}/` }),
      probe,
      stop: async () => { stopped += 1; },
    });
    await manager.launch("C:/projects/one");
    const result = await manager.launch("C:/projects/one");
    assert.equal(result.reused, false);
    assert.equal(starts, 2);
    assert.equal(stopped, 1);
  }
});
test("keeps separate lifecycle records for distinct project identities", async () => {
  let starts = 0;
  const manager = lifecycle({ start: () => ({ child: child(), url: `http://127.0.0.1:${4410 + starts++}/` }) });
  const [one, two] = await Promise.all([manager.launch("C:/projects/one"), manager.launch("C:/projects/two")]);
  assert.notEqual(one.url, two.url);
  assert.equal(manager.records().length, 2);
});
test("removes dead children and records whose project filesystem identity changed", async () => {
  let identity = "volume-a:file-1";
  let starts = 0;
  let stopped = 0;
  const firstChild = child();
  const manager = lifecycle({
    identity: () => identity,
    start: () => ({ child: starts++ === 0 ? firstChild : child(), url: `http://127.0.0.1:${4410 + starts - 1}/` }),
    stop: async () => { stopped += 1; },
  });
  await manager.launch("C:/projects/one");
  firstChild.exitCode = 1;
  await manager.launch("C:/projects/one");
  identity = "volume-a:file-2";
  await manager.launch("C:/projects/one");
  assert.equal(starts, 3);
  assert.equal(stopped, 2);
});

test("canonical root reuse follows the device and inode pair after root replacement", async () => {
  let replacement = false;
  const identity = createProjectIdentity({
    fs: {
      realpath: () => "C:/projects/canonical",
      stat: () => (replacement ? { dev: 7n, ino: 11n } : { dev: 7n, ino: 10n }),
    },
  });
  let starts = 0;
  const manager = lifecycle({
    identity: identity.identity,
    start: () => ({ child: child(), url: `http://127.0.0.1:${4410 + starts++}/` }),
  });
  const root = identity.canonicalPath("C:/projects/link");
  assert.equal((await manager.launch(root)).reused, false);
  assert.equal((await manager.launch(root)).reused, true);
  replacement = true;
  assert.equal((await manager.launch(root)).reused, false);
  assert.equal(starts, 2);
});
test("evicts the least recently used open child at the exact 30-minute idle boundary", async () => {
  let time = 0;
  let starts = 0;
  const stopped = [];
  const manager = lifecycle({
    now: () => time,
    start: ({ projectPath }) => ({ child: child(), url: `http://127.0.0.1:${4410 + starts++}/`, projectPath }),
    stop: async (record) => { stopped.push(record.projectPath); },
  });
  for (let index = 0; index < 8; index += 1) {
    time = index;
    await manager.launch(`C:/projects/${index}`);
  }
  time = 30 * 60 * 1000;
  await manager.launch("C:/projects/nine");
  assert.deepEqual(stopped, ["C:/projects/0"]);
  assert.equal(manager.records().length, 8);
});
test("does not evict starting or recently used capacity and returns retryable capacity", async () => {
  let time = 0;
  const pending = [];
  const manager = lifecycle({
    now: () => time,
    start: () => {
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  });
  const starts = Array.from({ length: 8 }, (_value, index) => manager.launch(`C:/projects/${index}`));
  await assert.rejects(manager.launch("C:/projects/nine"), (error) => error.message === "code_explorer_capacity" && error.retryable === true);
  assert.equal(manager.records().length, 8);
  for (const item of pending) item.resolve({ child: child(), url: "http://127.0.0.1:4410/" });
  await Promise.all(starts);
});

test("direct probe uses Node HTTP with exact loopback target, host, and a 64 KiB response bound", async () => {
  const request = (options, callback) => {
    assert.deepEqual(options, {
      host: "127.0.0.1",
      port: 4410,
      path: "/",
      method: "GET",
      headers: { Host: "127.0.0.1:4410" },
      agent: false,
    });
    const req = new EventEmitter();
    req.end = () => {
      const socket = new EventEmitter();
      socket.remoteAddress = "127.0.0.1";
      req.emit("socket", socket);
      const response = new EventEmitter();
      response.statusCode = 200;
      response.resume = () => {};
      response.destroy = () => {};
      callback(response);
      response.emit("data", Buffer.alloc(65_536));
      response.emit("end");
    };
    req.destroy = () => {};
    return req;
  };
  assert.equal(await probeCodeExplorer("http://127.0.0.1:4410/", { request }), true);
});

test("direct probe waits for a connecting socket before checking its loopback address", async () => {
  const request = (_options, callback) => {
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () => {
      const socket = new EventEmitter();
      socket.connecting = true;
      req.emit("socket", socket);
      socket.remoteAddress = "127.0.0.1";
      socket.connecting = false;
      socket.emit("connect");
      const response = new EventEmitter();
      response.statusCode = 200;
      response.destroy = () => {};
      callback(response);
      response.emit("end");
    };
    return req;
  };
  assert.equal(await probeCodeExplorer("http://127.0.0.1:4410/", { request }), true);
});

test("direct probe rejects a redirect, non-loopback socket, overflow, and timeout", async () => {
  for (const scenario of [
    { status: 302 },
    { remoteAddress: "127.0.0.2" },
    { bytes: 65_537 },
    { timeout: true },
  ]) {
    const request = (_options, callback) => {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.setTimeout = (_milliseconds, handler) => {
        if (scenario.timeout) handler();
      };
      req.end = () => {
        if (scenario.timeout) return;
        const socket = new EventEmitter();
        socket.remoteAddress = scenario.remoteAddress ?? "127.0.0.1";
        req.emit("socket", socket);
        if (scenario.remoteAddress) return;
        const response = new EventEmitter();
        response.statusCode = scenario.status ?? 200;
        response.resume = () => {};
        response.destroy = () => {};
        callback(response);
        if (scenario.status) return;
        response.emit("data", Buffer.alloc(scenario.bytes ?? 0));
        response.emit("end");
      };
      return req;
    };
    assert.equal(await probeCodeExplorer("http://127.0.0.1:4410/", { request }), false);
  }
});
test("redacts verbose child failures into stable launch envelopes", () => {
  const verbose = new Error("Error: C:/users/me/project TOKEN=secret capability=abc\n at start (bundle.js:1)");
  assert.deepEqual(launchFailure(verbose), {
    code: "code_explorer_start_failed",
    message: "code_explorer_start_failed",
    retryable: true,
  });
});
test("a failed project envelope does not alter another project's reusable launch result", async () => {
  const manager = lifecycle({
    start: ({ projectPath }) => {
      if (projectPath === "C:/projects/failing") throw new Error("verbose secret failure");
      return { child: child(), url: "http://127.0.0.1:4410/" };
    },
  });
  assert.deepEqual(await launchResult(() => manager.launch("C:/projects/live")), {
    state: "open",
    url: "http://127.0.0.1:4410/",
    reused: false,
  });
  assert.deepEqual(await launchResult(() => manager.launch("C:/projects/failing")), {
    code: "code_explorer_start_failed",
    message: "code_explorer_start_failed",
    retryable: true,
  });
  assert.deepEqual(await launchResult(() => manager.launch("C:/projects/live")), {
    state: "open",
    url: "http://127.0.0.1:4410/",
    reused: true,
  });
});
test("a corrected retry starts a fresh bounded launch", async () => {
  let starts = 0;
  let corrected = false;
  const manager = lifecycle({
    start: () => {
      starts += 1;
      if (!corrected) throw new Error("not ready");
      return { child: child(), url: "http://127.0.0.1:4410/" };
    },
  });
  assert.equal((await launchResult(() => manager.launch("C:/projects/one"))).code, "code_explorer_start_failed");
  corrected = true;
  assert.deepEqual(await launchResult(() => manager.launch("C:/projects/one")), {
    state: "open",
    url: "http://127.0.0.1:4410/",
    reused: false,
  });
  assert.equal(starts, 2);
});
test("rejects navigation-operation launch bodies without forwarding an operation", () => {
  const { admin } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  for (const operation of ["search", "focus", "follow", "history", "status", "arbitrary"]) {
    assert.throws(
      () => admin.selectLaunch(0, { registry_revision: admin.listProjects().registry_revision, operation }),
      (error) => error.message === "invalid_launch_request",
    );
  }
});
