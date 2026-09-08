import { runGitCommand } from "./git-process-boundary.js";
import { referenceSources } from "./repository-analysis-references.js";
import {
  buildWorkspaceCandidates,
  buildWorkspaceInventory,
  assertWorkspaceInventoryLimit,
  inspectWorkspacePaths,
  discoverWorkspace,
  readIgnoredProvenance,
} from "./repository-analysis-workspace-steps.js";
import type { WorkspaceStageInput } from "./repo-workspace-input.js";

async function collectWorkspaceInputs(input: WorkspaceStageInput) {
  const discovery = await discoverWorkspace(input.root, input.runGit);
  const untrackedMetadata = inspectWorkspacePaths(
    input.root,
    discovery.untracked,
    input.options.exclude,
  );
  const ignoredMetadata = inspectWorkspacePaths(
    input.root,
    discovery.ignored,
    input.options.exclude,
  );
  const provenance = await readIgnoredProvenance({
    root: input.root,
    ignored: discovery.ignored,
    exclude: input.options.exclude,
    runGit: input.runGit,
  });
  return { discovery, untrackedMetadata, ignoredMetadata, provenance };
}

function buildWorkspaceCandidatesAndInventory(
  input: WorkspaceStageInput,
  stage: Awaited<ReturnType<typeof collectWorkspaceInputs>>,
) {
  const workspaceCandidates = buildWorkspaceCandidates({
    untrackedMetadata: stage.untrackedMetadata,
    ignoredMetadata: stage.ignoredMetadata,
    ignoredProvenance: stage.provenance.ignoredProvenance,
    analysisTimestampMs: input.analysisTimestampMs,
    minimumAgeDays: input.options.untrackedAgeDays,
  });
  const inventory = buildWorkspaceInventory({
    trackedOutput: stage.discovery.trackedOutput.stdout,
    workspaceCandidates,
  });
  return { workspaceCandidates, inventory };
}

export async function analyzeWorkspaceStage(input: WorkspaceStageInput) {
  const stage = await collectWorkspaceInputs(input);
  const { workspaceCandidates, inventory } =
    buildWorkspaceCandidatesAndInventory(input, stage);
  assertWorkspaceInventoryLimit(inventory);
  const references = referenceSources(input.root, inventory);
  return {
    references,
    workspaceCandidates,
    inventory,
    warnings: [
      ...stage.untrackedMetadata.warnings,
      ...stage.ignoredMetadata.warnings,
      ...references.warnings,
    ],
    gitOutputs: [
      stage.discovery.trackedOutput,
      stage.discovery.untrackedOutput,
      stage.discovery.ignoredOutput,
      stage.provenance.ignoreOutput,
    ].filter((output) => output !== undefined),
  };
}
