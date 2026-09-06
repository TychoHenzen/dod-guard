import { homedir } from "node:os";
import { join } from "node:path";
import type { BackendAllowlistEntry } from "../backend-launch/backend-allowlist-entry.js";
import {
  type BackendLaunchPolicyOptions,
  createBackendLaunchPolicy,
} from "../backend-launch/backend-launch-policy.js";
import type { Language } from "../contracts/contract.js";
import type * as runtimeOptions from "../runtime/runtime-launch-policy-options.js";
import { loadAdapterSelectionRecord } from "./adapter-selection-loader.js";
import type { AdapterSelectionRecord } from "./adapter-selection-record.js";

type TrustedCommandRoot =
  AdapterSelectionRecord["trusted_command_roots"]["win32"][number];

export function createRuntimeLaunchPolicy(
  options: runtimeOptions.RuntimeLaunchPolicyOptions,
  record: AdapterSelectionRecord = loadRecord(),
) {
  const platform =
    options.platform ?? (process.platform === "win32" ? "win32" : "posix");
  return createBackendLaunchPolicy({
    ...options,
    platform,
    allowlist: runtimeAllowlist(record, platform),
  });
}

function loadRecord(): AdapterSelectionRecord {
  return loadAdapterSelectionRecord();
}

export function runtimeAllowlist(
  record: AdapterSelectionRecord,
  platform: "posix" | "win32",
): readonly BackendAllowlistEntry[] {
  return record.runtime_backends.map((backend) => ({
    language: backend.language as Language,
    executable_basename: backend.platform_executables[platform],
    entrypoint_basenames: backend.platform_entrypoints[platform],
    executable_sha256: backend.authorization.executable_sha256,
    entrypoint_sha256s: backend.authorization.entrypoint_sha256s,
    package_metadata_sha256: backend.authorization.package_metadata_sha256,
    compatible_version: backend.compatible_version,
    arguments: backend.arguments,
    endpoint: backend.endpoint,
    environment: backend.environment,
    safe_initialization_options: backend.safe_initialization_options,
    sentinel_passed:
      backend.sentinel_evidence.platform === platform &&
      backend.sentinel_evidence.passed,
  }));
}

export function resolveTrustedCommandRoots(
  identifiers: readonly TrustedCommandRoot[],
): readonly string[] {
  return identifiers.map((identifier) => trustedCommandRoots()[identifier]);
}

function trustedCommandRoots(): Record<TrustedCommandRoot, string> {
  const home = homedir();
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
  return {
    cargo_home_bin: join(cargoHome(home), "bin"),
    dotnet_tools: join(home, ".dotnet", "tools"),
    node_install: join(programFiles, "nodejs"),
    npm_global: join(appData, "npm"),
    code_explorer_backends: codeExplorerBackends(programFiles),
  };
}

function cargoHome(home: string): string {
  return process.env.CARGO_HOME ?? join(home, ".cargo");
}

function codeExplorerBackends(programFiles: string): string {
  return (
    process.env.CODE_EXPLORER_BACKENDS_ROOT ??
    join(programFiles, "Code Explorer", "backends")
  );
}
