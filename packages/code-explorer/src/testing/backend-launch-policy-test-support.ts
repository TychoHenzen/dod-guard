import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  type BackendIdentity,
  createBackendLaunchPolicy,
} from "../semantic/backend-launch/backend-launch-policy.js";
import type { BackendLaunchPreparation } from "../semantic/backend-launch/backend-launch-preparation.js";
import { createPythonMirrorPlan } from "../semantic/python-mirror/python-mirror.js";

export type { BackendIdentity };
export { assert, createBackendLaunchPolicy, createPythonMirrorPlan };

export const identity: BackendIdentity = {
  canonical_path: "/host/bin/rust-analyzer",
  device: "host-device",
  file_id: "host-file",
  sha256: "a".repeat(64),
  version: "1.0.0",
  regular_file: true,
  link_or_reparse_point: false,
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

export function pythonIdentity(
  overrides: Partial<BackendIdentity> = {},
): BackendIdentity {
  return {
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
    ...overrides,
  };
}

export function assertRustPreparation(
  preparation: BackendLaunchPreparation,
  executable: string,
  event?: "project_backend_config_ignored",
): void {
  assert.deepEqual(preparation, {
    status: "ready",
    executable,
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
    ...(event ? { event } : {}),
  });
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
