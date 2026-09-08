import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function roslynStorePath(root: string): string {
  const storeSegments = [
    ".store",
    "roslyn-language-server",
    "5.11.0-1.26380.4",
  ];
  const runtimeSegments = [
    "roslyn-language-server.win-x64",
    "5.11.0-1.26380.4",
    "tools",
    "net10.0",
    "win-x64",
  ];
  return join(root, ...storeSegments, ...runtimeSegments);
}

export function executable(language: string): string {
  return language === "rust"
    ? "rust-analyzer.exe"
    : language === "python"
      ? "node.exe"
      : "roslyn-language-server.exe";
}

export function entrypoints(language: string): string[] {
  return [`${language}-server.js`];
}

export function safeOptions(language: string) {
  return language === "rust"
    ? {
        cargo: {
          buildScripts: { enable: false },
          procMacro: { enable: false },
          checkOnSave: { enable: false },
        },
        projectConfiguration: { enable: false },
      }
    : language === "python"
      ? { use_project_environment: false, mirror_only: true }
      : { analyzers: false, source_generators: false };
}

export function createAuthorization(
  root: string,
  language: string,
  packageMetadataHash: string,
) {
  const executableName = executable(language);
  const entrypointNames = entrypoints(language);
  const versionProbe =
    language === "python"
      ? {
          method: "package_json",
          command_root: "code_explorer_backends",
          executable: executableName,
          entrypoints: entrypointNames,
          arguments: [],
          command_template:
            "<code_explorer_backends>/node_modules/pyright/package.json",
        }
      : {
          method: "command",
          command_root: "code_explorer_backends",
          executable: executableName,
          entrypoints: entrypointNames,
          arguments: ["--version"],
          command_template:
            `<code_explorer_backends>/${executableName} --version`,
        };
  const executablePath =
    language === "csharp"
      ? join(roslynStorePath(root), executableName)
      : join(root, executableName);
  return {
    executable_sha256: sha256(readFileSync(executablePath)),
    entrypoint_sha256s: entrypointNames.map((entrypoint) =>
      sha256(readFileSync(join(root, "node_modules", "pyright", entrypoint))),
    ),
    package_metadata_sha256: language === "python" ? packageMetadataHash : null,
    version_probe: versionProbe,
  };
}
