import { dirname, join } from "node:path";
import type { BackendFileIdentity } from "../backend-launch/backend-file-identity.js";
import type { BackendIdentity } from "../backend-launch/backend-identity.js";
import { inspectNativeFile, isWithin } from "./native-backend-file.js";

type NativeBackendCandidateInput = {
  language: "rust" | "python" | "csharp";
  projectRoot?: string;
  roots: readonly string[];
};

export function findPackageMetadata(
  input: NativeBackendCandidateInput,
  entrypoints: readonly BackendFileIdentity[],
): BackendFileIdentity | undefined {
  if (input.language !== "python") return undefined;
  const entrypoint = entrypoints[0]?.canonical_path;
  const root = entrypoint
    ? input.roots.find((candidate) => isWithin(candidate, entrypoint))
    : undefined;
  return entrypoint && root
    ? inspectNativeFile(
        join(dirname(entrypoint), "package.json"),
        root,
        input.projectRoot,
      )
    : undefined;
}

export function candidateIdentity(
  input: NativeBackendCandidateInput,
  details: {
    executable: BackendFileIdentity & {
      canonical_path: string;
    };
    files: BackendFileIdentity[];
    version: string;
    packageMetadata: BackendFileIdentity | undefined;
  },
): BackendIdentity | undefined {
  if (input.language === "python" && !details.packageMetadata) return undefined;
  return {
    ...details.executable,
    version: details.version,
    entrypoints: details.files,
    ...(details.packageMetadata
      ? { package_metadata: details.packageMetadata }
      : {}),
  };
}

export function pinnedRoslynExecutable(
  root: string,
  executableBasename: string,
): string {
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
