import type { NormalizedAnalysisOptions } from "./types.js";
import type { runGitCommand } from "./git-process-boundary.js";
export type WorkspaceStageInput = {
    root: string;
    options: NormalizedAnalysisOptions;
    runGit: typeof runGitCommand;
    analysisTimestampMs: number;
};
