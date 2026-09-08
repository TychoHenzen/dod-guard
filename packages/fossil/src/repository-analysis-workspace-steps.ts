import { lstatSync } from "node:fs";
import { join } from "node:path";
import { runGitCommand } from "./git-process-boundary.js";
import { successfulGit } from "./repository-analysis-support.js";
import {
  CHECK_IGNORE_ARGUMENTS,
  filterWorkspaceDiscoveryPaths,
  inspectWorkspaceFileMetadataWithWarnings,
  oldIgnoredWorkspaceCandidates,
  oldUntrackedWorkspaceCandidates,
  parseVerboseCheckIgnore,
} from "./workspace-debris-boundary.js";

export * from "./repository-analysis-workspace-discovery.js";
export {
  assertWorkspaceInventoryLimit,
  buildWorkspaceInventory,
} from "./repository-analysis-workspace-inventory.js";

export function inspectWorkspacePaths(
  root: string,
  paths: readonly string[],
  exclude: readonly string[],
) {
  const inspect = (path: string) => {
    const metadata = lstatSync(join(root, path));
    return {
      path,
      isRegularFile: metadata.isFile(),
      isSymbolicLink: metadata.isSymbolicLink(),
      modifiedTimestampMs: metadata.mtimeMs,
    };
  };
  return inspectWorkspaceFileMetadataWithWarnings(paths, inspect, exclude);
}

export async function readIgnoredProvenance({
  root,
  ignored,
  exclude,
  runGit,
}: {
  root: string;
  ignored: readonly string[];
  exclude: readonly string[];
  runGit: typeof runGitCommand;
}) {
  const filteredIgnored = filterWorkspaceDiscoveryPaths(ignored, exclude);
  if (filteredIgnored.length === 0)
    return {
      ignoreOutput: undefined,
      ignoredProvenance: parseVerboseCheckIgnore(""),
    };
  const ignoreOutput = await successfulGit({
    runGit,
    arguments_: CHECK_IGNORE_ARGUMENTS,
    repositoryPath: root,
    input: `${filteredIgnored.join("\0")}\0`,
  });
  return {
    ignoreOutput,
    ignoredProvenance: parseVerboseCheckIgnore(ignoreOutput.stdout),
  };
}

export function buildWorkspaceCandidates(input: {
  untrackedMetadata: ReturnType<
    typeof inspectWorkspaceFileMetadataWithWarnings
  >;
  ignoredMetadata: ReturnType<typeof inspectWorkspaceFileMetadataWithWarnings>;
  ignoredProvenance: ReturnType<typeof parseVerboseCheckIgnore>;
  analysisTimestampMs: number;
  minimumAgeDays: number;
}) {
  return [
    ...oldUntrackedWorkspaceCandidates(
      input.untrackedMetadata.metadata,
      input.analysisTimestampMs,
      input.minimumAgeDays,
    ),
    ...oldIgnoredWorkspaceCandidates({
      files: input.ignoredMetadata.metadata,
      provenance: input.ignoredProvenance,
      analysisTimestampMs: input.analysisTimestampMs,
      minimumAgeDays: input.minimumAgeDays,
    }),
  ];
}
