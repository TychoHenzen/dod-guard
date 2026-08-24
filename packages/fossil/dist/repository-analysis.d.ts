import { runGitCommand } from "./git-process.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
type GitCommandRunner = typeof runGitCommand;
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
export declare function analyzeRepositoryCore(repositoryPath: string, options: NormalizedAnalysisOptions, runGit?: GitCommandRunner): Promise<FossilReport>;
export {};
