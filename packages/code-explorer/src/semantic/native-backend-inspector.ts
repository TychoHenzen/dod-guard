import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { BackendFileIdentity, BackendIdentity } from "./backend-launch-policy.js";
import type { Language } from "./contract.js";

/** Inspects fixed server-configured roots. Ambient PATH cannot authorize a source-reading backend. */
export function createNativeBackendInspector(commandRoots: readonly string[], projectRoot?: string) {
  const roots = commandRoots.filter((root) => isAbsolute(root) && !(projectRoot && isWithin(projectRoot, root)));
  return (
    language: Language,
    executableBasename: string,
    entrypointBasenames: readonly string[] = [],
  ): BackendIdentity | undefined => {
    for (const root of roots) {
      const executable = inspectFile(
        language === "csharp" ? pinnedRoslynExecutable(root, executableBasename) : join(root, executableBasename),
        root,
        projectRoot,
      );
      if (!executable?.canonical_path) continue;
      const entrypoints = entrypointBasenames.map((name) =>
        roots
          .map((entrypointRoot) =>
            inspectFile(join(entrypointRoot, "node_modules", "pyright", name), entrypointRoot, projectRoot),
          )
          .find(Boolean),
      );
      if (entrypoints.some((entrypoint) => !entrypoint)) continue;
      const version = probeVersion(language, executable.canonical_path, entrypoints as BackendFileIdentity[]);
      if (!version) continue;
      const entrypointRoot = entrypoints[0]?.canonical_path
        ? roots.find((candidateRoot) => isWithin(candidateRoot, entrypoints[0]?.canonical_path ?? ""))
        : undefined;
      const packageMetadata =
        language === "python" && entrypoints[0]?.canonical_path && entrypointRoot
          ? inspectFile(join(dirname(entrypoints[0].canonical_path), "package.json"), entrypointRoot, projectRoot)
          : undefined;
      if (language === "python" && !packageMetadata) continue;
      return {
        ...executable,
        version,
        entrypoints: entrypoints as BackendFileIdentity[],
        ...(packageMetadata ? { package_metadata: packageMetadata } : {}),
      };
    }
    return undefined;
  };
}

/** The dotnet tool shim is a command script. Only the pinned store payload is executable evidence. */
function pinnedRoslynExecutable(root: string, executableBasename: string): string {
  return join(
    root,
    ".store",
    "roslyn-language-server",
    "5.11.0-1.26380.4",
    "roslyn-language-server.win-x64",
    "5.11.0-1.26380.4",
    "tools",
    "net10.0",
    "win-x64",
    executableBasename,
  );
}

function inspectFile(candidate: string, root: string, projectRoot?: string): BackendFileIdentity | undefined {
  try {
    const link = lstatSync(candidate);
    if (!link.isFile() || link.isSymbolicLink()) return undefined;
    const canonicalPath = realpathSync.native(candidate);
    if (!isWithin(root, canonicalPath) || (projectRoot && isWithin(projectRoot, canonicalPath))) return undefined;
    const stat = statSync(canonicalPath, { bigint: true });
    return {
      canonical_path: canonicalPath,
      device: String(stat.dev),
      file_id: String(stat.ino),
      sha256: createHash("sha256").update(readFileSync(canonicalPath)).digest("hex"),
      regular_file: true,
      link_or_reparse_point: false,
    };
  } catch {
    return undefined;
  }
}

function probeVersion(
  language: Language,
  executable: string,
  entrypoints: readonly BackendFileIdentity[],
): string | undefined {
  if (language === "csharp") return peFileVersion(executable) ?? commandVersion(executable);
  if (language === "python") return pyrightPackageVersion(entrypoints[0]?.canonical_path);
  return commandVersion(executable);
}

function commandVersion(executable: string): string | undefined {
  const arguments_ = ["--version"];
  if (arguments_.some((argument) => !argument)) return undefined;
  const probe = spawnSync(executable, arguments_, {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    windowsHide: true,
  });
  return probe.status === 0 ? firstVersion(`${probe.stdout}\n${probe.stderr}`) : undefined;
}

/** Roslyn does not support --version. Read the PE ProductVersion/FileVersion resource conservatively. */
function peFileVersion(path: string): string | undefined {
  const source = readFileSync(path).toString("utf16le");
  const productVersion = /ProductVersion\0(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(source)?.[1];
  return productVersion?.replace(/^v/, "") ?? firstVersion(source.match(/FileVersion[\s\S]{0,160}/)?.[0] ?? "");
}

function pyrightPackageVersion(entrypoint: string | undefined): string | undefined {
  if (!entrypoint) return undefined;
  try {
    const packageJson = JSON.parse(readFileSync(join(dirname(entrypoint), "package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" && /^\d+\.\d+\.\d+$/.test(packageJson.version)
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

function firstVersion(output: string): string | undefined {
  return output.match(/(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/)?.[1];
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}
