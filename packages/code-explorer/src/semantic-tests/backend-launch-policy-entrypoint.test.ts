import { it } from "node:test";
import {
  assert,
  createBackendLaunchPolicy,
  identity,
  policyAllowlist,
  pythonAllowlist,
  pythonIdentity,
} from "../testing/backend-launch-policy-test-support.js";

it("binds a trusted entrypoint into fixed arguments and rejects an identity change", () => {
  let current = pythonIdentity();
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: pythonAllowlist(),
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
    safe_initialization_options: {
      use_project_environment: false,
      mirror_only: true,
    },
  });
  const entrypoint = current.entrypoints?.[0];
  if (!entrypoint) throw new Error("expected trusted entrypoint");
  current = {
    ...current,
    entrypoints: [{ ...entrypoint, sha256: "c".repeat(64) }],
  };
  assert.deepEqual(launch.confirmInitialized("python"), {
    status: "unavailable",
    code: "backend_identity_changed",
    terminate: true,
  });
});

it("rejects a same-version C# executable byte replacement before spawn", () => {
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        ...policyAllowlist()[0],
        language: "csharp",
        executable_basename: "roslyn-language-server",
      },
    ],
    inspect: () => ({
      ...identity,
      canonical_path: "/host/bin/roslyn-language-server",
      sha256: "b".repeat(64),
    }),
  });
  assert.deepEqual(launch.prepare("csharp"), {
    status: "unavailable",
    code: "backend_identity_changed",
  });
});
