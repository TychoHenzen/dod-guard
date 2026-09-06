import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BackendFileIdentity } from "./backend-file-identity.js";
import type { Language } from "./contract.js";

export function probeVersion(
  language: Language,
  executable: string,
  entrypoints: readonly BackendFileIdentity[],
): string | undefined {
  if (language === "csharp")
    return peFileVersion(executable) ?? commandVersion(executable);
  if (language === "python")
    return pyrightPackageVersion(entrypoints[0]?.canonical_path);
  return commandVersion(executable);
}

function commandVersion(executable: string): string | undefined {
  const probe = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 5_000,
    windowsHide: true,
  });
  return probe.status === 0
    ? firstVersion(`${probe.stdout}\n${probe.stderr}`)
    : undefined;
}

function peFileVersion(path: string): string | undefined {
  const source = readFileSync(path).toString("utf16le");
  const version =
    /ProductVersion\0(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(
      source,
    )?.[1];
  return (
    version?.replace(/^v/, "") ??
    firstVersion(source.match(/FileVersion[\s\S]{0,160}/)?.[0] ?? "")
  );
}

function pyrightPackageVersion(
  entrypoint: string | undefined,
): string | undefined {
  if (!entrypoint) return undefined;
  try {
    const parseJson = JSON.parse;
    const packageJson = parseJson(
      readFileSync(join(dirname(entrypoint), "package.json"), "utf8"),
    ) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" &&
      /^\d+\.\d+\.\d+$/.test(packageJson.version)
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

function firstVersion(output: string): string | undefined {
  return output.match(
    /(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/,
  )?.[1];
}
