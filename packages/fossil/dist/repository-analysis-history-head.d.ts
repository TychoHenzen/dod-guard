import { runGitCommand } from "./git-process-boundary.js";
export declare function historyOutputForHead(exitCode: number | null, runGit: typeof runGitCommand, root: string): Promise<import("./git-process-boundary.js").CollectedGitOutput>;
