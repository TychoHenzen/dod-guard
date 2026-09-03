import assert from "node:assert/strict";
import test from "node:test";
import { createAdmin } from "../lib/project-admin.mjs";
import { discoverCodeExplorer, spawnCodeExplorer } from "../lib/code-explorer-launch.mjs";

function storeFor(projects) {
  return { get: () => ({ projects }) };
}

function launchSnapshot(projects, readablePaths = new Set(projects.map((project) => project.path))) {
  const admin = createAdmin(storeFor(projects), { isProject: (path) => readablePaths.has(path) });
  return { admin, snapshot: admin.listProjects() };
}

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered readable project is selected
test("selects only the current registered canonical project path", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.deepEqual(admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }), {
    name: "one",
    path: "C:/projects/one",
  });
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry changed after rendering
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

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Browser includes a project path
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

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry index does not exist
test("rejects a missing index from a matching registry snapshot", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.throws(
    () => admin.selectLaunch(1, { registry_revision: snapshot.registry_revision }),
    (error) => error.message === "project_not_registered",
  );
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered project is no longer readable
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

// covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Operator override names a packaged entry
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

// covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Operator override is absent
test("freezes the valid monorepo bundle when no override is set", () => {
  const fs = fileSystem(packagedFiles("C:/monorepo/packages/code-explorer"));
  assert.equal(discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: {}, fs }), "C:/monorepo/packages/code-explorer/dist/bundle.js");
});

// covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Selected package contract is invalid
test("rejects invalid override metadata without falling back or spawning", () => {
  const files = {
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    "C:/cache/code-explorer/dist/bundle.js": {},
    "C:/cache/code-explorer/package.json": { text: '{"name":"other","main":"dist/bundle.js"}' },
    "C:/cache/code-explorer/.claude-plugin/plugin.json": { text: '{"name":"code-explorer"}' },
  };
  const fs = fileSystem(files);
  assert.throws(
    () => discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: { CODE_EXPLORER_JS: "C:/cache/code-explorer/dist/bundle.js" }, fs }),
    (error) => error.message === "code_explorer_unavailable",
  );
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/monorepo/")));
  assert.throws(
    () => discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: { CODE_EXPLORER_JS: "" }, fs }),
    (error) => error.message === "code_explorer_unavailable",
  );
});

// covers: openspec-dashboard/code-explorer-launch :: Code Explorer discovery accepts only its packaged entry :: Registered project contains an executable candidate
test("ignores project-local executable candidates", () => {
  const fs = fileSystem({
    ...packagedFiles("C:/monorepo/packages/code-explorer"),
    ...packagedFiles("C:/projects/untrusted/code-explorer"),
  });
  const entry = discoverCodeExplorer({ monorepoRoot: "C:/monorepo", env: {}, fs });
  assert.equal(entry, "C:/monorepo/packages/code-explorer/dist/bundle.js");
  assert.ok(fs.reads.every((path) => !path.startsWith("C:/projects/")));
});

// covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: New child is started
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

// covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: Project name contains shell syntax
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

// covers: openspec-dashboard/code-explorer-launch :: Child launch is fixed, shell-free, and environment-minimal :: Dashboard environment contains credentials or Node options
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
