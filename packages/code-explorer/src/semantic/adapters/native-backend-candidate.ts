import { join } from "node:path";
import type {
  BackendFileIdentity,
} from "../backend-launch/backend-file-identity.js";
import type { BackendIdentity } from "../backend-launch/backend-identity.js";
import type { Language } from "../contracts/contract.js";
import {
  candidateIdentity,
  findPackageMetadata,
  pinnedRoslynExecutable,
} from "./native-backend-candidate-details.js";
import { inspectNativeFile } from "./native-backend-file.js";
import { probeVersion } from "./native-backend-version.js";

export function inspectBackendCandidate(input: {
  language: Language;
  root: string;
  projectRoot?: string;
  executableBasename: string;
  entrypointBasenames: readonly string[];
  roots: readonly string[];
}): BackendIdentity | undefined {
  const executable = inspectExecutable(input);
  if (!hasCanonicalPath(executable)) return undefined;
  const entrypoints = findEntrypoints(input);
  return completeCandidate(input, executable, entrypoints);
}

function hasCanonicalPath(
  identity: BackendFileIdentity | undefined,
): identity is BackendFileIdentity & {
  canonical_path: string;
} {
  return Boolean(identity?.canonical_path);
}

function completeCandidate(
  input: Parameters<typeof inspectBackendCandidate>[0],
  executable: BackendFileIdentity & {
    canonical_path: string;
  },
  entrypoints: (BackendFileIdentity | undefined)[],
): BackendIdentity | undefined {
  if (entrypoints.some((entrypoint) => !entrypoint)) return undefined;
  const files = entrypoints as BackendFileIdentity[];
  const version = probeVersion(
    input.language,
    executable.canonical_path,
    files,
  );
  if (!version) return undefined;
  const packageMetadata = findPackageMetadata(input, files);
  return candidateIdentity(input, {
    executable,
    files,
    version,
    packageMetadata,
  });
}

function inspectExecutable(input: {
  language: Language;
  root: string;
  projectRoot?: string;
  executableBasename: string;
}): BackendFileIdentity | undefined {
  const candidate =
    input.language === "csharp"
      ? pinnedRoslynExecutable(input.root, input.executableBasename)
      : join(input.root, input.executableBasename);
  return inspectNativeFile(candidate, input.root, input.projectRoot);
}

function findEntrypoints(input: {
  root: string;
  projectRoot?: string;
  entrypointBasenames: readonly string[];
  roots: readonly string[];
}): (BackendFileIdentity | undefined)[] {
  return input.entrypointBasenames.map((name) =>
    input.roots
      .map((entrypointRoot) =>
        inspectNativeFile(
          join(entrypointRoot, "node_modules", "pyright", name),
          entrypointRoot,
          input.projectRoot,
        ),
      )
      .find(Boolean),
  );
}
