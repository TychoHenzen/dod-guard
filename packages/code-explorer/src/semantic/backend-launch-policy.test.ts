import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";
import {
  type BackendIdentity,
  createBackendLaunchPolicy,
  createPythonMirrorPlan,
  pythonConfigurationReply,
  pythonSafeEnvironment,
} from "./backend-launch-policy.js";

const identity: BackendIdentity = {
  canonical_path: "/host/bin/rust-analyzer",
  device: "host-device",
  file_id: "host-file",
  sha256: "a".repeat(64),
  version: "1.0.0",
  regular_file: true,
  link_or_reparse_point: false,
};

function policy(overrides: Partial<BackendIdentity> & { endpoint?: "stdio" | string } = {}) {
  return createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        language: "rust",
        executable_basename: "rust-analyzer",
        executable_sha256: "a".repeat(64),
        compatible_version: "^1.0.0",
        arguments: ["--stdio"],
        endpoint: overrides.endpoint ?? "http://127.0.0.1:8181",
        environment: { RUST_BACKTRACE: "0" },
        safe_initialization_options: {
          cargo: {
            buildScripts: { enable: false },
            procMacro: { enable: false },
            checkOnSave: { enable: false },
          },
          projectConfiguration: { enable: false },
        },
        sentinel_passed: true,
      },
    ],
    inspect: () => ({ ...identity, ...overrides }),
  });
}

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Project config names another executable
it("ignores project backend commands and keeps the allowlisted command", () => {
  const launch = policy().prepare("rust", { command: "project-owned-server", arguments: ["--unsafe"] });

  assert.deepEqual(launch, {
    status: "ready",
    executable: "/host/bin/rust-analyzer",
    version: "1.0.0",
    arguments: ["--stdio"],
    shell: false,
    environment: { RUST_BACKTRACE: "0" },
    endpoint: "http://127.0.0.1:8181",
    safe_initialization_options: {
      cargo: {
        buildScripts: { enable: false },
        procMacro: { enable: false },
        checkOnSave: { enable: false },
      },
      projectConfiguration: { enable: false },
    },
    event: "project_backend_config_ignored",
  });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Backend requests a workspace edit
it("rejects protocol write requests without retaining their payload", () => {
  const result = policy().handleBackendRequest("workspace/applyEdit", { changes: { "/project/a.rs": [] } });

  assert.deepEqual(result, { accepted: false, code: "backend_write_rejected" });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Allowlisted executable is missing
it("does not install or substitute a missing allowlisted executable", () => {
  assert.deepEqual(policy({ canonical_path: undefined }).prepare("rust"), {
    status: "unavailable",
    code: "backend_unavailable",
  });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Backend advertises a remote endpoint
it("rejects non-loopback backend endpoints", () => {
  assert.deepEqual(policy().setEndpoint("rust", "https://example.test/lsp"), {
    status: "unavailable",
    code: "backend_endpoint_rejected",
  });
  assert.deepEqual(policy().setEndpoint("rust", "http://127.0.0.1:8181"), { status: "ready" });
  assert.deepEqual(policy().setEndpoint("rust", "http://localhost:8181"), {
    status: "unavailable",
    code: "backend_endpoint_rejected",
  });
  assert.deepEqual(policy({ endpoint: "stdio" }).setEndpoint("rust", "stdio"), { status: "ready" });
  assert.deepEqual(policy({ endpoint: "http://127.1.2.3:8181" }).setEndpoint("rust", "http://127.1.2.3:8181"), {
    status: "ready",
  });
  assert.deepEqual(policy({ endpoint: "http://[::1]:8181" }).setEndpoint("rust", "http://[::1]:8181"), {
    status: "ready",
  });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Allowlisted executable changes before restart
it("refuses a restart when its accepted identity tuple changes", () => {
  let current = identity;
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: policyAllowlist(),
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = { ...identity, sha256: "b".repeat(64) };
  assert.deepEqual(launch.prepare("rust"), { status: "unavailable", code: "backend_identity_changed" });
});

it("binds a trusted entrypoint into fixed arguments and rejects an entrypoint replacement", () => {
  let current: BackendIdentity = {
    ...identity,
    canonical_path: "/host/bin/node",
    entrypoints: [
      {
        canonical_path: "/host/npm/node_modules/pyright/langserver.index.js",
        device: "host-device",
        file_id: "entrypoint-file",
        sha256: "b".repeat(64),
        regular_file: true,
        link_or_reparse_point: false,
      },
    ],
    package_metadata: {
      canonical_path: "/host/npm/node_modules/pyright/package.json",
      device: "host-device",
      file_id: "package-file",
      sha256: "d".repeat(64),
      regular_file: true,
      link_or_reparse_point: false,
    },
  };
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        ...policyAllowlist()[0],
        language: "python",
        executable_basename: "node",
        entrypoint_basenames: ["langserver.index.js"],
        executable_sha256: "a".repeat(64),
        entrypoint_sha256s: ["b".repeat(64)],
        package_metadata_sha256: "d".repeat(64),
        arguments: ["{entrypoint:0}", "--stdio"],
        safe_initialization_options: { use_project_environment: false, mirror_only: true },
      },
    ],
    inspect: () => current,
  });
  assert.deepEqual(launch.prepare("python"), {
    status: "ready",
    executable: "/host/bin/node",
    version: "1.0.0",
    arguments: ["/host/npm/node_modules/pyright/langserver.index.js", "--stdio"],
    shell: false,
    environment: { RUST_BACKTRACE: "0" },
    endpoint: "http://127.0.0.1:8181",
    safe_initialization_options: { use_project_environment: false, mirror_only: true },
  });
  const entrypoint = current.entrypoints?.[0];
  if (!entrypoint) throw new Error("expected trusted entrypoint");
  current = { ...current, entrypoints: [{ ...entrypoint, sha256: "c".repeat(64) }] };
  assert.deepEqual(launch.confirmInitialized("python"), {
    status: "unavailable",
    code: "backend_identity_changed",
    terminate: true,
  });
});

it("rejects a same-version C# executable byte replacement before spawn", () => {
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [{ ...policyAllowlist()[0], language: "csharp", executable_basename: "roslyn-language-server" }],
    inspect: () => ({ ...identity, canonical_path: "/host/bin/roslyn-language-server", sha256: "b".repeat(64) }),
  });
  assert.deepEqual(launch.prepare("csharp"), { status: "unavailable", code: "backend_identity_changed" });
});

it("rejects a Python package metadata byte replacement before spawn", () => {
  const current: BackendIdentity = {
    ...identity,
    canonical_path: "/host/bin/node",
    entrypoints: [
      {
        canonical_path: "/host/npm/node_modules/pyright/langserver.index.js",
        device: "host-device",
        file_id: "entrypoint-file",
        sha256: "b".repeat(64),
        regular_file: true,
        link_or_reparse_point: false,
      },
    ],
    package_metadata: {
      canonical_path: "/host/npm/node_modules/pyright/package.json",
      device: "host-device",
      file_id: "package-file",
      sha256: "c".repeat(64),
      regular_file: true,
      link_or_reparse_point: false,
    },
  };
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        ...policyAllowlist()[0],
        language: "python",
        executable_basename: "node",
        entrypoint_basenames: ["langserver.index.js"],
        entrypoint_sha256s: ["b".repeat(64)],
        package_metadata_sha256: "d".repeat(64),
        arguments: ["{entrypoint:0}", "--stdio"],
        safe_initialization_options: { use_project_environment: false, mirror_only: true },
      },
    ],
    inspect: () => current,
  });
  assert.deepEqual(launch.prepare("python"), { status: "unavailable", code: "backend_identity_changed" });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Executable changes during launch
it("rejects and terminates a process when verification changes after initialization", () => {
  let current = identity;
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: policyAllowlist(),
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = { ...identity, version: "1.0.1" };
  assert.deepEqual(launch.confirmInitialized("rust"), {
    status: "unavailable",
    code: "backend_identity_changed",
    terminate: true,
  });
});

// covers: code-explorer/language-adapters :: Backend launch configuration is server-owned :: Host cannot prove executable identity
it("refuses launch before spawn when device or file identity cannot be proved", () => {
  assert.deepEqual(policy({ device: undefined }).prepare("rust"), {
    status: "unavailable",
    code: "backend_identity_unverifiable",
  });
});

it("reports an unaccepted incompatible version without relabeling it as an identity change", () => {
  assert.deepEqual(policy({ version: "2.0.0" }).prepare("rust"), {
    status: "unavailable",
    code: "unsupported_backend_version",
  });
});

it("uses configured platform path comparison and rejects project descendants or basename substitution", () => {
  const windowsIdentity = { ...identity, canonical_path: "C:\\host\\rust-analyzer.exe" };
  const allowlist = [{ ...policyAllowlist()[0], executable_basename: "rust-analyzer.exe" }];
  assert.equal(
    createBackendLaunchPolicy({
      project_root: "C:\\project",
      platform: "win32",
      allowlist,
      inspect: () => windowsIdentity,
    }).prepare("rust").status,
    "ready",
  );
  assert.deepEqual(
    createBackendLaunchPolicy({
      project_root: "C:\\project",
      platform: "win32",
      allowlist,
      inspect: () => ({ ...windowsIdentity, canonical_path: "C:\\project\\bin\\rust-analyzer.exe" }),
    }).prepare("rust"),
    { status: "unavailable", code: "backend_identity_unverifiable" },
  );
  assert.deepEqual(
    createBackendLaunchPolicy({
      project_root: "C:\\project",
      platform: "win32",
      allowlist,
      inspect: () => ({ ...windowsIdentity, canonical_path: "C:\\host\\other.exe" }),
    }).prepare("rust"),
    { status: "unavailable", code: "backend_identity_unverifiable" },
  );
});

it("treats Windows executable path and basename case changes as the accepted identity", () => {
  let current = { ...identity, canonical_path: "C:\\HOST\\RUST-ANALYZER.EXE" };
  const launch = createBackendLaunchPolicy({
    project_root: "C:\\project",
    platform: "win32",
    allowlist: [{ ...policyAllowlist()[0], executable_basename: "rust-analyzer.exe" }],
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = { ...current, canonical_path: "c:\\host\\rust-analyzer.exe" };
  assert.deepEqual(launch.prepare("rust"), {
    status: "ready",
    executable: "c:\\host\\rust-analyzer.exe",
    version: "1.0.0",
    arguments: ["--stdio"],
    shell: false,
    environment: { RUST_BACKTRACE: "0" },
    endpoint: "http://127.0.0.1:8181",
    safe_initialization_options: {
      cargo: {
        buildScripts: { enable: false },
        procMacro: { enable: false },
        checkOnSave: { enable: false },
      },
      projectConfiguration: { enable: false },
    },
  });
});

it("snapshots server-owned launch data and freezes returned preparations", () => {
  const entry = policyAllowlist()[0];
  const launch = createBackendLaunchPolicy({ project_root: "/project", allowlist: [entry], inspect: () => identity });
  const preparation = launch.prepare("rust");
  if (preparation.status !== "ready") throw new Error("expected launch preparation");

  entry.arguments.push("--mutated");
  entry.environment.RUST_BACKTRACE = "1";
  (entry.safe_initialization_options.cargo as { buildScripts: { enable: boolean } }).buildScripts.enable = true;
  assert.deepEqual(preparation.arguments, ["--stdio"]);
  assert.deepEqual(preparation.environment, { RUST_BACKTRACE: "0" });
  assert.equal(
    (preparation.safe_initialization_options.cargo as { buildScripts: { enable: boolean } }).buildScripts.enable,
    false,
  );
  assert.throws(() => (preparation.arguments as string[]).push("--also-mutated"), TypeError);
  assert.throws(() => ((preparation.environment as { RUST_BACKTRACE: string }).RUST_BACKTRACE = "2"), TypeError);
  assert.throws(
    () =>
      ((preparation.safe_initialization_options.cargo as { buildScripts: { enable: boolean } }).buildScripts.enable =
        true),
    TypeError,
  );
});

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Rust project contains executable build hooks
it("uses Rust safe options without project executable hooks", () => {
  const launch = policy().prepare("rust");
  assert.equal(launch.status, "ready");
  assert.deepEqual(policy().safeOptions("rust"), {
    cargo: {
      buildScripts: { enable: false },
      procMacro: { enable: false },
      checkOnSave: { enable: false },
    },
    projectConfiguration: { enable: false },
  });
});

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: C# project contains executable analyzers
it("rejects an allowlist mode without verified C# analyzer-safe sentinel evidence", () => {
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [{ ...policyAllowlist()[0], language: "csharp", sentinel_passed: false }],
    inspect: () => identity,
  });
  assert.deepEqual(launch.prepare("csharp"), { status: "unavailable", code: "unsafe_backend_mode" });
  const safe = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        ...policyAllowlist()[0],
        language: "csharp",
        safe_initialization_options: { analyzers: false, source_generators: false },
      },
    ],
    inspect: () => identity,
  });
  assert.deepEqual(safe.safeOptions("csharp"), { analyzers: false, source_generators: false });
  assert.equal(safe.prepare("csharp").status, "ready");
});

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Python project selects an interpreter or external path
it("rejects Python interpreter and external analysis selection before launch", () => {
  assert.deepEqual(createPythonMirrorPlan({ venvPath: ".venv", extraPaths: ["/outside"] }, []), {
    status: "unavailable",
    code: "unsafe_backend_mode",
  });
  assert.deepEqual(
    pythonSafeEnvironment(
      { PATH: "/project/bin;/host/bin", PYTHONPATH: "x", VIRTUAL_ENV: "x", CONDA_PREFIX: "x" },
      "/project",
      "win32",
    ),
    {
      PATH: "/host/bin",
    },
  );
  assert.deepEqual(pythonConfigurationReply("python.pythonPath"), []);
  assert.deepEqual(pythonConfigurationReply("python.venvPath"), []);
  assert.deepEqual(pythonConfigurationReply("python.analysis.extraPaths"), []);
  assert.deepEqual(
    pythonSafeEnvironment(
      { PATH: "/project/bin:/host/bin", PYTHONPATH: "x", VIRTUAL_ENV: "x", CONDA_PREFIX: "x" },
      "/project",
      "posix",
    ),
    { PATH: "/host/bin" },
  );
});

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Python configuration changes after validation
it("invalidates the old Python mirror when project configuration changes", () => {
  const text = "x = 1";
  const mirror = createPythonMirrorPlan({}, [{ path: "src/a.py", sha256: digest(text), text }], {
    generation: 4,
    mirror_uri_root: "file:///service-mirror",
    bundled_typeshed: ["typeshed/stdlib"],
  });
  assert.equal(mirror.status, "ready");
  if (mirror.status !== "ready") throw new Error("expected safe mirror");
  assert.deepEqual(mirror.minimal_pyrightconfig, {});
  assert.deepEqual(mirror.bundled_typeshed, ["typeshed/stdlib"]);
  assert.deepEqual(mirror.resolveUri("file:///service-mirror/src/a.py", 4, digest(text)), {
    status: "accepted",
    original_path: "src/a.py",
  });
  assert.deepEqual(mirror.resolveUri("file:///service-mirror/unknown.py", 4, digest(text)), {
    status: "rejected",
    code: "unsafe_backend_mode",
  });
  assert.deepEqual(mirror.resolveUri("file:///service-mirror/%E0%A4%A", 4, digest(text)), {
    status: "rejected",
    code: "unsafe_backend_mode",
  });
  assert.deepEqual(mirror.onProjectConfigurationChanged(), { status: "rebuild_required", terminate_old_backend: true });
});

it("materializes only hash-verified mirror sources and locks them read-only", () => {
  const writes: string[] = [];
  const text = "x = 1";
  const mirror = createPythonMirrorPlan({}, [{ path: "src/a.py", sha256: digest(text), text }], {
    generation: 1,
    mirror_uri_root: "file:///service-mirror",
    bundled_typeshed: ["typeshed/stdlib"],
    filesystem: { writeFile: (path) => writes.push(path), makeReadOnly: () => writes.push("readonly-root") },
  });

  assert.equal(mirror.status, "ready");
  assert.deepEqual(writes, ["pyrightconfig.json", "src/a.py", "readonly-root"]);
  assert.deepEqual(createPythonMirrorPlan({}, [{ path: "src/a.py", sha256: "a".repeat(64), text }]), {
    status: "unavailable",
    code: "unsafe_backend_mode",
  });
});

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Backend lacks a verified safe configuration
it("does not launch a mode whose sentinel proof is absent", () => {
  assert.deepEqual(policyAllowlist({ sentinel_passed: false }), [
    {
      language: "rust",
      executable_basename: "rust-analyzer",
      executable_sha256: "a".repeat(64),
      compatible_version: "^1.0.0",
      arguments: ["--stdio"],
      endpoint: "http://127.0.0.1:8181",
      environment: { RUST_BACKTRACE: "0" },
      safe_initialization_options: {
        cargo: {
          buildScripts: { enable: false },
          procMacro: { enable: false },
          checkOnSave: { enable: false },
        },
        projectConfiguration: { enable: false },
      },
      sentinel_passed: false,
    },
  ]);
  assert.deepEqual(
    createBackendLaunchPolicy({
      project_root: "/project",
      allowlist: policyAllowlist({ sentinel_passed: false }),
      inspect: () => identity,
    }).prepare("rust"),
    { status: "unavailable", code: "unsafe_backend_mode" },
  );
});

function policyAllowlist(overrides: Record<string, unknown> = {}) {
  return [
    {
      language: "rust" as const,
      executable_basename: "rust-analyzer",
      executable_sha256: "a".repeat(64),
      compatible_version: "^1.0.0",
      arguments: ["--stdio"],
      endpoint: "http://127.0.0.1:8181",
      environment: { RUST_BACKTRACE: "0" },
      safe_initialization_options: {
        cargo: {
          buildScripts: { enable: false },
          procMacro: { enable: false },
          checkOnSave: { enable: false },
        },
        projectConfiguration: { enable: false },
      },
      sentinel_passed: true,
      ...overrides,
    },
  ];
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
