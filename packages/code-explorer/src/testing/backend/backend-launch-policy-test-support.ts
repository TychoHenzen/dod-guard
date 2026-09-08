import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  type BackendIdentity,
  createBackendLaunchPolicy,
} from "../../semantic/backend-launch/backend-launch-policy.js";
import { createPythonMirrorPlan } from "../../semantic/python-mirror/python-mirror.js";
import {
  identity,
  pythonIdentity,
} from "./backend-launch-policy-test-identity.js";

export { assertRustPreparation } from "./backend-launch-policy-test-assertions.js";
export {
  identity,
  pythonIdentity,
} from "./backend-launch-policy-test-identity.js";
export type { BackendIdentity };
export { assert, createBackendLaunchPolicy, createPythonMirrorPlan };

const rustAllowlistEntry = {
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
};

export function policy(
  overrides: Partial<BackendIdentity> & {
    endpoint?: "stdio" | string;
  } = {},
) {
  return createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: policyAllowlist(
      overrides.endpoint === undefined ? {} : { endpoint: overrides.endpoint },
    ),
    inspect: () => ({ ...identity, ...overrides }),
  });
}

export function policyAllowlist(overrides: Record<string, unknown> = {}) {
  return [{ ...structuredClone(rustAllowlistEntry), ...overrides }];
}

export function pythonAllowlist(overrides: Record<string, unknown> = {}) {
  return [
    {
      ...policyAllowlist()[0],
      language: "python" as const,
      executable_basename: "node",
      entrypoint_basenames: ["langserver.index.js"],
      executable_sha256: "a".repeat(64),
      entrypoint_sha256s: ["b".repeat(64)],
      package_metadata_sha256: "d".repeat(64),
      arguments: ["{entrypoint:0}", "--stdio"],
      safe_initialization_options: {
        use_project_environment: false,
        mirror_only: true,
      },
      ...overrides,
    },
  ];
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
