import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { entrypoints, executable, createAuthorization, safeOptions } from "./index-test-standalone-authorization.js";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sentinel(language: string, version: string, fixtureHash: string, authorization: ReturnType<typeof createAuthorization>) {
  return {
    executable: executable(language),
    executable_sha256: authorization.executable_sha256,
    entrypoints: entrypoints(language),
    entrypoint_sha256s: authorization.entrypoint_sha256s,
    package_metadata_sha256: authorization.package_metadata_sha256,
    backend_version: version,
    fixture_sha256: fixtureHash,
    version_probe: authorization.version_probe,
    startup: true,
    definition_navigation: true,
    side_effect_absent: true,
    stderr: "",
    positive_control: { initialized: true, definition_responded: true, side_effect_absent: false },
  };
}

export function createStandaloneBackendRecord(root: string, counters: Record<string, string>) {
  const version = process.version.replace(/^v/, "");
  const languages = ["rust", "python", "csharp"];
  const fixtureHashes = Object.fromEntries(languages.map((language) => [language, sha256(`${language}:fixture`)]));
  const packageMetadataHash = sha256(readFileSync(join(root, "node_modules", "pyright", "package.json")));
  const authorizations = Object.fromEntries(languages.map((language) => [language, createAuthorization(root, language, packageMetadataHash)]));
  const runtimeBackends = languages.map((language) => ({
    language,
    platform_executables: { win32: executable(language), posix: executable(language).replace(/\.exe$/, "") },
    platform_entrypoints: { win32: entrypoints(language), posix: entrypoints(language) },
    compatible_version: version,
    arguments: ["{entrypoint:0}"],
    endpoint: "stdio",
    environment: { CODE_EXPLORER_FAKE_COUNTER: counters[language] ?? "" },
    safe_initialization_options: safeOptions(language),
    capabilities: { definition: "unavailable", references: "unavailable", type_definition: "unavailable", implementation: "unavailable", callers: "unavailable", callees: "unavailable" },
    sentinel_evidence: { fixture: `fixtures/${language}`, platform: "win32", fixture_sha256: fixtureHashes[language] ?? "", side_effect_absent: true, result: "passed", passed: true },
    authorization: authorizations[language],
  }));
  const sentinelRuns = Object.fromEntries(
    languages.map((language) => [language, sentinel(language, version, fixtureHashes[language] ?? "", authorizations[language])]),
  ) as Record<string, ReturnType<typeof sentinel> & { environment?: Record<string, string> }>;
  if (sentinelRuns.python) sentinelRuns.python = { ...sentinelRuns.python, environment: { PATH: "", PYTHONPATH: "", VIRTUAL_ENV: "", CONDA_PREFIX: "" } };
  return {
    record: {
      schema_version: 1,
      source_dependency_versions: { serena: "test-only", "@p1va/symbols": "test-only" },
      evidence_artifact: "adapter-selection-evidence.json",
      trusted_command_roots: { posix: ["posix_code_explorer_backends"], win32: ["code_explorer_backends"] },
      selected_paths: { rust: "direct_standard_public_lsp", python: "direct_standard_public_lsp", csharp: "direct_standard_public_lsp" },
      runtime_backends: runtimeBackends,
    },
    evidence: {
      schema_version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      purpose: "Standalone installed-package test fixture.",
      platforms: {
        win32: { status: "passed", command_roots: ["code_explorer_backends"], commands: ["test fixture"], bounded_output: "test fixture", backend_versions: { rust: version, python: version, csharp: version }, positive_controls: { rust: "passed", python: "passed", csharp: "passed" } },
        posix: { status: "unproven", command_roots: ["posix_code_explorer_backends"], commands: [], bounded_output: "not run", backend_versions: { rust: null, python: null, csharp: null }, positive_controls: { rust: "not_run", python: "not_run", csharp: "not_run" } },
      },
      fixture_tree_hashes: fixtureHashes,
      sentinel_runs: sentinelRuns,
    },
  };
}
