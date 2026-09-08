import { runGitCommand } from "./git-process-boundary.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
export declare function analyzeRepositoryCore(repositoryPath: string, options: NormalizedAnalysisOptions, runGit?: typeof runGitCommand): Promise<FossilReport>;
