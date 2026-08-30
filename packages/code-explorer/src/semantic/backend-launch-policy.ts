import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import type { Language } from "./contract.js";

export type BackendIdentity = {
  canonical_path?: string;
  device?: string;
  file_id?: string;
  sha256?: string;
  version?: string;
  regular_file: boolean;
  link_or_reparse_point: boolean;
};

export type BackendAllowlistEntry = {
  language: Language;
  executable_basename: string;
  compatible_version: string;
  arguments: readonly string[];
  endpoint: "stdio" | string;
  environment: Readonly<Record<string, string>>;
  safe_initialization_options: Readonly<Record<string, unknown>>;
  sentinel_passed: boolean;
};

export type BackendLaunchPolicyOptions = {
  project_root: string;
  platform?: "posix" | "win32";
  allowlist: readonly BackendAllowlistEntry[];
  inspect(language: Language, executableBasename: string): BackendIdentity | undefined;
};

export type BackendLaunchPreparation =
  | {
      status: "ready";
      executable: string;
      arguments: readonly string[];
      shell: false;
      environment: Readonly<Record<string, string>>;
      endpoint: "stdio" | string;
      safe_initialization_options: Readonly<Record<string, unknown>>;
      event?: "project_backend_config_ignored";
    }
  | { status: "unavailable"; code: BackendLaunchFailure };

export type BackendLaunchFailure =
  | "backend_unavailable"
  | "unsafe_backend_mode"
  | "backend_identity_unverifiable"
  | "backend_identity_changed"
  | "unsupported_backend_version"
  | "backend_endpoint_rejected";

type AcceptedBackend = { entry: BackendAllowlistEntry; identity: Required<BackendIdentity> };

/**
 * Holds only host-owned backend launch data. It deliberately produces an
 * executable plus fixed arguments instead of spawning a process, so later LSP
 * lifecycle code cannot accidentally inherit a shell or a project command.
 */
export function createBackendLaunchPolicy(options: BackendLaunchPolicyOptions) {
  const platform = options.platform ?? platformForHost();
  const allowlist = deepFreeze(options.allowlist.map(snapshotAllowlistEntry));
  const policyOptions = { ...options, allowlist, platform };
  const accepted = new Map<Language, AcceptedBackend>();

  return {
    prepare(language: Language, projectConfiguration?: unknown): BackendLaunchPreparation {
      const entry = allowlist.find((candidate) => candidate.language === language);
      if (!entry) return { status: "unavailable", code: "backend_unavailable" };
      if (!(entry.sentinel_passed && safeModeIsProven(entry)))
        return { status: "unavailable", code: "unsafe_backend_mode" };

      const inspected = inspect(entry, policyOptions);
      const prior = accepted.get(language);
      if (inspected.status !== "accepted") {
        return {
          status: "unavailable",
          code: inspected.code === "version_incompatible" ? "unsupported_backend_version" : inspected.code,
        };
      }
      if (prior && !sameIdentity(prior.identity, inspected.identity, platform)) {
        accepted.delete(language);
        return { status: "unavailable", code: "backend_identity_changed" };
      }
      accepted.set(language, { entry, identity: inspected.identity });
      return {
        status: "ready",
        executable: inspected.identity.canonical_path,
        arguments: entry.arguments,
        shell: false,
        environment: entry.environment,
        endpoint: entry.endpoint,
        safe_initialization_options: entry.safe_initialization_options,
        ...(projectConfiguration === undefined ? {} : { event: "project_backend_config_ignored" }),
      };
    },

    confirmInitialized(
      language: Language,
    ): { status: "ready" } | { status: "unavailable"; code: BackendLaunchFailure; terminate: true } {
      const prior = accepted.get(language);
      if (!prior) return { status: "unavailable", code: "backend_unavailable", terminate: true };
      const inspected = inspect(prior.entry, policyOptions);
      if (inspected.status === "accepted" && sameIdentity(prior.identity, inspected.identity, platform))
        return { status: "ready" };
      accepted.delete(language);
      return {
        status: "unavailable",
        code:
          inspected.status === "accepted" || inspected.code === "version_incompatible"
            ? "backend_identity_changed"
            : inspected.code,
        terminate: true,
      };
    },

    setEndpoint(
      language: Language,
      endpoint: string,
    ): { status: "ready" } | { status: "unavailable"; code: "backend_endpoint_rejected" } {
      const entry = allowlist.find((candidate) => candidate.language === language);
      return entry?.endpoint === endpoint && isPermittedEndpoint(endpoint)
        ? { status: "ready" }
        : { status: "unavailable", code: "backend_endpoint_rejected" };
    },

    handleBackendRequest(
      method: string,
      _params: unknown,
    ): { accepted: false; code: "backend_write_rejected" | "backend_request_rejected" } {
      return {
        accepted: false,
        code:
          method === "workspace/applyEdit" || method.startsWith("workspace/")
            ? "backend_write_rejected"
            : "backend_request_rejected",
      };
    },

    safeOptions(language: Language): Readonly<Record<string, unknown>> | undefined {
      return allowlist.find((entry) => entry.language === language)?.safe_initialization_options;
    },
  };
}

function inspect(
  entry: BackendAllowlistEntry,
  options: BackendLaunchPolicyOptions,
):
  | { status: "accepted"; identity: Required<BackendIdentity> }
  | {
      status: "rejected";
      code: Exclude<BackendLaunchFailure, "unsupported_backend_version"> | "version_incompatible";
    } {
  const identity = options.inspect(entry.language, entry.executable_basename);
  if (!identity?.canonical_path) return { status: "rejected", code: "backend_unavailable" };
  if (!(identity.device && identity.file_id && identity.sha256 && identity.version)) {
    return { status: "rejected", code: "backend_identity_unverifiable" };
  }
  if (
    !identity.regular_file ||
    identity.link_or_reparse_point ||
    isWithin(options.project_root, identity.canonical_path, options.platform ?? platformForHost()) ||
    !samePath(
      basename(identity.canonical_path, options.platform ?? platformForHost()),
      entry.executable_basename,
      options.platform ?? platformForHost(),
    )
  ) {
    return { status: "rejected", code: "backend_identity_unverifiable" };
  }
  if (!/^[a-f0-9]{64}$/i.test(identity.sha256)) return { status: "rejected", code: "backend_identity_unverifiable" };
  if (!versionMatches(identity.version, entry.compatible_version))
    return { status: "rejected", code: "version_incompatible" };
  return { status: "accepted", identity: identity as Required<BackendIdentity> };
}

function sameIdentity(
  left: Required<BackendIdentity>,
  right: Required<BackendIdentity>,
  platform: "posix" | "win32",
): boolean {
  return (
    samePath(left.canonical_path, right.canonical_path, platform) &&
    left.device === right.device &&
    left.file_id === right.file_id &&
    left.sha256 === right.sha256 &&
    left.version === right.version
  );
}

function samePath(left: string, right: string, platform: "posix" | "win32"): boolean {
  if (platform === "posix") return left === right;
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
}

function versionMatches(version: string, compatibleRange: string): boolean {
  if (!compatibleRange.startsWith("^")) return version === compatibleRange;
  const [major] = compatibleRange.slice(1).split(".");
  return version.split(".")[0] === major;
}

function isWithin(root: string, candidate: string, platform: "posix" | "win32"): boolean {
  const path = platform === "win32" ? win32 : posix;
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  );
}

function basename(value: string, platform: "posix" | "win32"): string {
  return (platform === "win32" ? win32 : posix).basename(value);
}

function platformForHost(): "posix" | "win32" {
  return process.platform === "win32" ? "win32" : "posix";
}

function isPermittedEndpoint(endpoint: string): boolean {
  if (endpoint === "stdio") return true;
  try {
    const url = new URL(endpoint);
    return /^127(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname === "[::1]" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function safeModeIsProven(entry: BackendAllowlistEntry): boolean {
  const options = entry.safe_initialization_options as Record<string, unknown>;
  if (entry.language === "rust") {
    const cargo = options.cargo as Record<string, unknown> | undefined;
    return (
      (cargo?.buildScripts as Record<string, unknown> | undefined)?.enable === false &&
      (cargo?.procMacro as Record<string, unknown> | undefined)?.enable === false &&
      (cargo?.checkOnSave as Record<string, unknown> | undefined)?.enable === false &&
      (options.projectConfiguration as Record<string, unknown> | undefined)?.enable === false
    );
  }
  if (entry.language === "csharp") {
    return options.analyzers === false && options.source_generators === false;
  }
  return options.use_project_environment === false && options.mirror_only === true;
}

export type PythonMirrorInput = { path: string; sha256: string; text: string; symlink?: boolean; sensitive?: boolean };

export type PythonMirrorOptions = {
  generation: number;
  mirror_uri_root: string;
  bundled_typeshed: readonly string[];
  filesystem?: {
    writeFile(path: string, text: string): void;
    makeReadOnly(): void;
  };
};

type PythonMirrorPlan =
  | { status: "unavailable"; code: "unsafe_backend_mode" }
  | {
      status: "ready";
      manifest: Readonly<Record<string, string>>;
      files: readonly Readonly<{ path: string; sha256: string; text: string }>[];
      generation: number;
      minimal_pyrightconfig: Readonly<Record<string, never>>;
      bundled_typeshed: readonly string[];
      resolveUri(
        uri: string,
        generation: number,
        sha256: string,
      ): { status: "accepted"; original_path: string } | { status: "rejected"; code: "unsafe_backend_mode" };
      onProjectConfigurationChanged(): { status: "rebuild_required"; terminate_old_backend: true };
    };

/**
 * Validates parsed pyrightconfig.json and [tool.pyright] data, then creates an
 * immutable source-only Python mirror plan before a backend can use it.
 */
export function createPythonMirrorPlan(
  configuration: Record<string, unknown>,
  files: readonly PythonMirrorInput[],
  options: PythonMirrorOptions = {
    generation: 0,
    mirror_uri_root: "file:///code-explorer-mirror",
    bundled_typeshed: [],
  },
): PythonMirrorPlan {
  if (
    containsUnsafePythonConfiguration(configuration) ||
    files.some((file) => !isSafePythonMirrorFile(file)) ||
    options.bundled_typeshed.some((path) => unsafePath(path))
  ) {
    return { status: "unavailable", code: "unsafe_backend_mode" };
  }
  const manifest = Object.freeze(Object.fromEntries(files.map((file) => [file.path, file.sha256])));
  const mirrored = Object.freeze(files.map(({ path, sha256, text }) => Object.freeze({ path, sha256, text })));
  if (options.filesystem) {
    options.filesystem.writeFile("pyrightconfig.json", "{}");
    for (const file of mirrored) options.filesystem.writeFile(file.path, file.text);
    options.filesystem.makeReadOnly();
  }
  return {
    status: "ready",
    manifest,
    files: mirrored,
    generation: options.generation,
    minimal_pyrightconfig: Object.freeze({}),
    bundled_typeshed: Object.freeze([...options.bundled_typeshed]),
    resolveUri: (uri, generation, sha256) => {
      const path = uriToMirrorPath(uri, options.mirror_uri_root);
      return path && generation === options.generation && manifest[path] === sha256
        ? { status: "accepted", original_path: path }
        : { status: "rejected", code: "unsafe_backend_mode" };
    },
    onProjectConfigurationChanged: () => ({ status: "rebuild_required", terminate_old_backend: true }),
  };
}

export function pythonSafeEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  projectRoot: string,
  platform: "posix" | "win32" = platformForHost(),
): Record<string, string> {
  const delimiter = platform === "win32" ? ";" : ":";
  const pathEntries = (environment.PATH ?? "").split(delimiter);
  const path = pathEntries.filter((entry) => entry && !isWithin(projectRoot, entry, platform)).join(delimiter);
  return path ? { PATH: path } : {};
}

export function pythonConfigurationReply(key: string): unknown {
  return ["python.pythonPath", "python.venvPath", "python.analysis.extraPaths"].includes(key) ? [] : undefined;
}

function containsUnsafePythonConfiguration(value: unknown, key?: string): boolean {
  const prohibited = new Set([
    "extends",
    "venvPath",
    "venv",
    "extraPaths",
    "typeshedPath",
    "stubPath",
    "executionEnvironments",
    "pythonPath",
    "python.pythonPath",
    "python.venvPath",
    "python.analysis.extraPaths",
  ]);
  if (key && prohibited.has(key)) return true;
  if (typeof value === "string") return unsafePath(value);
  if (Array.isArray(value)) return value.some((item) => containsUnsafePythonConfiguration(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([childKey, child]) =>
    containsUnsafePythonConfiguration(child, childKey),
  );
}

function isSafePythonMirrorFile(file: PythonMirrorInput): boolean {
  return (
    (file.path.endsWith(".py") || file.path.endsWith(".pyi")) &&
    !file.symlink &&
    !file.sensitive &&
    !unsafePath(file.path) &&
    !file.path.split(/[\\/]/).includes("..") &&
    /^[a-f0-9]{64}$/i.test(file.sha256) &&
    createHash("sha256").update(file.text).digest("hex") === file.sha256
  );
}

function unsafePath(value: string): boolean {
  return posix.isAbsolute(value) || win32.isAbsolute(value) || value.split(/[\\/]/).includes("..");
}

function uriToMirrorPath(uri: string, root: string): string | undefined {
  if (!uri.startsWith(`${root}/`)) return undefined;
  try {
    const path = decodeURIComponent(uri.slice(root.length + 1));
    return unsafePath(path) ? undefined : path;
  } catch {
    return undefined;
  }
}

function snapshotAllowlistEntry(entry: BackendAllowlistEntry): BackendAllowlistEntry {
  return {
    language: entry.language,
    executable_basename: entry.executable_basename,
    compatible_version: entry.compatible_version,
    arguments: [...entry.arguments],
    endpoint: entry.endpoint,
    environment: { ...entry.environment },
    safe_initialization_options: cloneValue(entry.safe_initialization_options),
    sentinel_passed: entry.sentinel_passed,
  };
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, cloneValue(child)]),
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
