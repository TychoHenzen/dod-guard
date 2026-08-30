import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  type BackendAllowlistEntry,
  type BackendIdentity,
  type BackendLaunchPolicyOptions,
  createBackendLaunchPolicy,
} from "./backend-launch-policy.js";
import { type Language, languages, relationNames } from "./contract.js";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const win32CommandRoot = z.enum([
  "cargo_home_bin",
  "dotnet_tools",
  "node_install",
  "npm_global",
  "code_explorer_backends",
]);
const posixCommandRoot = z.literal("posix_code_explorer_backends");
const commandRoot = z.union([win32CommandRoot, posixCommandRoot]);
const versionProbe = z
  .object({
    method: z.enum(["command", "package_json", "windows_file_version"]),
    command_root: commandRoot,
    executable: z.string().min(1),
    entrypoints: z.array(z.string().min(1)),
    arguments: z.array(z.string()),
    command_template: z.string().min(1),
  })
  .strict();

const recordSchema = z
  .object({
    schema_version: z.literal(1),
    source_dependency_versions: z.object({ serena: z.string().min(1), "@p1va/symbols": z.string().min(1) }).strict(),
    evidence_artifact: z.literal("adapter-selection-evidence.json"),
    trusted_command_roots: z
      .object({
        posix: z.array(z.literal("posix_code_explorer_backends")).min(1),
        win32: z
          .array(z.enum(["cargo_home_bin", "dotnet_tools", "node_install", "npm_global", "code_explorer_backends"]))
          .min(1),
      })
      .strict(),
    selected_paths: z
      .object({
        rust: z.literal("direct_standard_public_lsp"),
        python: z.literal("direct_standard_public_lsp"),
        csharp: z.literal("direct_standard_public_lsp"),
      })
      .strict(),
    runtime_backends: z.array(
      z
        .object({
          language: z.enum(languages),
          platform_executables: z.object({ posix: z.string().min(1), win32: z.string().min(1) }).strict(),
          platform_entrypoints: z
            .object({ posix: z.array(z.string().min(1)), win32: z.array(z.string().min(1)) })
            .strict(),
          compatible_version: z.string().min(1),
          arguments: z.array(z.string()),
          endpoint: z.literal("stdio"),
          environment: z.record(z.string()),
          safe_initialization_options: z.record(z.unknown()),
          capabilities: z
            .object(Object.fromEntries(relationNames.map((name) => [name, z.enum(["ready", "unavailable", "failed"])])))
            .strict(),
          sentinel_evidence: z
            .object({
              fixture: z.string().min(1),
              platform: z.enum(["win32", "posix"]),
              fixture_sha256: z.string().min(1),
              side_effect_absent: z.boolean(),
              result: z.enum(["passed", "unproven", "failed"]),
              passed: z.boolean(),
            })
            .strict()
            .superRefine((evidence, context) => {
              if (evidence.passed && !(evidence.result === "passed" && evidence.side_effect_absent)) {
                context.addIssue({ code: z.ZodIssueCode.custom, message: "passing sentinel evidence is inconsistent" });
              }
            }),
          authorization: z
            .object({
              executable_sha256: sha256,
              entrypoint_sha256s: z.array(sha256),
              package_metadata_sha256: sha256.nullable(),
              version_probe: versionProbe,
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((record, context) => {
    for (const language of languages) {
      if (record.runtime_backends.filter((backend) => backend.language === language).length !== 1) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `exactly one ${language} backend is required` });
      }
    }
  });

const sentinelRunSchema = z
  .object({
    executable: z.string().min(1),
    executable_sha256: sha256,
    entrypoints: z.array(z.string().min(1)),
    entrypoint_sha256s: z.array(sha256),
    package_metadata_sha256: sha256.nullable(),
    backend_version: z.string().min(1),
    fixture_sha256: sha256,
    version_probe: versionProbe,
    startup: z.literal(true),
    definition_navigation: z.literal(true),
    side_effect_absent: z.literal(true),
    stderr: z.string().max(1024),
    positive_control: z
      .object({
        initialized: z.literal(true),
        definition_responded: z.literal(true),
        side_effect_absent: z.literal(false),
      })
      .strict(),
  })
  .strict();

const evidenceSchema = z
  .object({
    schema_version: z.literal(1),
    recorded_at: z.string().datetime(),
    purpose: z.string().min(1),
    platforms: z
      .object({
        win32: z
          .object({
            status: z.enum(["passed", "unproven"]),
            command_roots: z.array(win32CommandRoot),
            commands: z.array(z.string()),
            bounded_output: z.string(),
            backend_versions: z.record(z.string(), z.string().nullable()),
            positive_controls: z.record(z.string(), z.string()),
          })
          .strict(),
        posix: z
          .object({
            status: z.enum(["passed", "unproven"]),
            command_roots: z.array(posixCommandRoot),
            commands: z.array(z.string()),
            bounded_output: z.string(),
            backend_versions: z.record(z.string(), z.string().nullable()),
            positive_controls: z.record(z.string(), z.string()),
          })
          .strict(),
      })
      .strict(),
    fixture_tree_hashes: z
      .object({
        rust: sha256,
        python: sha256,
        csharp: sha256,
      })
      .strict(),
    sentinel_runs: z
      .object({
        rust: sentinelRunSchema,
        python: sentinelRunSchema.extend({
          package_metadata_sha256: sha256,
          environment: z
            .object({
              PATH: z.literal(""),
              PYTHONPATH: z.literal(""),
              VIRTUAL_ENV: z.literal(""),
              CONDA_PREFIX: z.literal(""),
            })
            .strict(),
        }),
        csharp: sentinelRunSchema,
      })
      .strict(),
  })
  .strict();

export type AdapterSelectionRecord = z.infer<typeof recordSchema>;
export type AdapterSelectionEvidence = z.infer<typeof evidenceSchema>;
export type RuntimeLaunchPolicyOptions = Pick<BackendLaunchPolicyOptions, "project_root" | "platform" | "inspect">;

/**
 * Reads the production record beside this package. It never visits the spike
 * directory, so installed runtime packages do not need spike tooling or data.
 */
export function loadAdapterSelectionRecord(): AdapterSelectionRecord {
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(join(packageRoot, "adapter-selection.json"), "utf8"));
  } catch {
    throw new Error("invalid adapter selection record");
  }
  const record = parseAdapterSelectionRecord(input);
  try {
    const evidence = parseAdapterSelectionEvidence(
      JSON.parse(readFileSync(join(packageRoot, record.evidence_artifact), "utf8")),
    );
    if (!evidenceAligns(record, evidence)) throw new Error("invalid adapter selection evidence");
  } catch {
    throw new Error("invalid adapter selection evidence");
  }
  return record;
}

export function parseAdapterSelectionEvidence(input: unknown): AdapterSelectionEvidence {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid adapter selection evidence");
  return deepFreeze(parsed.data);
}

export function evidenceAligns(record: AdapterSelectionRecord, evidence: AdapterSelectionEvidence): boolean {
  return record.runtime_backends.every((backend) => {
    const run = evidence.sentinel_runs[backend.language];
    const platform = evidence.platforms[backend.sentinel_evidence.platform];
    return (
      backend.sentinel_evidence.fixture_sha256 === evidence.fixture_tree_hashes[backend.language] &&
      backend.sentinel_evidence.fixture_sha256 === run.fixture_sha256 &&
      backend.compatible_version === run.backend_version &&
      backend.platform_executables[backend.sentinel_evidence.platform] === run.executable &&
      arraysEqual(backend.platform_entrypoints[backend.sentinel_evidence.platform], run.entrypoints) &&
      backend.platform_entrypoints[backend.sentinel_evidence.platform].length ===
        backend.authorization.entrypoint_sha256s.length &&
      run.entrypoints.length === run.entrypoint_sha256s.length &&
      backend.authorization.executable_sha256 === run.executable_sha256 &&
      arraysEqual(backend.authorization.entrypoint_sha256s, run.entrypoint_sha256s) &&
      backend.authorization.package_metadata_sha256 === run.package_metadata_sha256 &&
      (backend.language === "python"
        ? backend.authorization.package_metadata_sha256 !== null
        : backend.authorization.package_metadata_sha256 === null) &&
      versionProbesEqual(backend.authorization.version_probe, run.version_probe) &&
      backend.authorization.version_probe.executable === run.executable &&
      arraysEqual(backend.authorization.version_probe.entrypoints, run.entrypoints) &&
      platform.command_roots.includes(backend.authorization.version_probe.command_root as never) &&
      backend.sentinel_evidence.passed === (platform.status === "passed" && run.side_effect_absent) &&
      arraysEqual(record.trusted_command_roots.win32, evidence.platforms.win32.command_roots) &&
      arraysEqual(record.trusted_command_roots.posix, evidence.platforms.posix.command_roots)
    );
  });
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function versionProbesEqual(
  left: AdapterSelectionRecord["runtime_backends"][number]["authorization"]["version_probe"],
  right: AdapterSelectionEvidence["sentinel_runs"][Language]["version_probe"],
): boolean {
  return (
    left.method === right.method &&
    left.command_root === right.command_root &&
    left.executable === right.executable &&
    arraysEqual(left.entrypoints, right.entrypoints) &&
    arraysEqual(left.arguments, right.arguments) &&
    left.command_template === right.command_template
  );
}

export function parseAdapterSelectionRecord(input: unknown): AdapterSelectionRecord {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid adapter selection record");
  return deepFreeze(parsed.data);
}

/** Creates the sole server-owned launch policy from the selected LSP records. */
export function createRuntimeLaunchPolicy(options: RuntimeLaunchPolicyOptions) {
  const platform = options.platform ?? (process.platform === "win32" ? "win32" : "posix");
  return createBackendLaunchPolicy({
    ...options,
    platform,
    allowlist: runtimeAllowlist(loadAdapterSelectionRecord(), platform),
  });
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
    sentinel_passed: backend.sentinel_evidence.platform === platform && backend.sentinel_evidence.passed,
  }));
}

export function resolveTrustedCommandRoots(
  identifiers: readonly AdapterSelectionRecord["trusted_command_roots"]["win32"][number][],
): readonly string[] {
  const home = homedir();
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
  const resolved = {
    cargo_home_bin: join(process.env.CARGO_HOME ?? join(home, ".cargo"), "bin"),
    dotnet_tools: join(home, ".dotnet", "tools"),
    node_install: join(programFiles, "nodejs"),
    npm_global: join(appData, "npm"),
    code_explorer_backends: process.env.CODE_EXPLORER_BACKENDS_ROOT ?? join(programFiles, "Code Explorer", "backends"),
  } as const;
  return identifiers.map((identifier) => resolved[identifier]);
}

export type RuntimeBackendInspector = (language: Language, executableBasename: string) => BackendIdentity | undefined;

function findPackageRoot(start: string): string {
  let directory = resolve(start);
  while (true) {
    try {
      const packageInfo = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: unknown };
      if (packageInfo.name === "code-explorer") return directory;
    } catch {
      // Keep walking until the package boundary is found.
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error("invalid adapter selection record");
    directory = parent;
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
