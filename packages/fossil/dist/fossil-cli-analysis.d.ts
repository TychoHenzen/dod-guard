import type { RepositoryAnalysisCore } from "./fossil-cli-types/repository-analysis-core.js";
import type { AnalyzeRepositoryResult } from "./types.js";
/** Runs the injected repository-analysis core and finalizes report-level statistics. */
export declare function analyzeRepository(repositoryPath: string, options: unknown, core?: RepositoryAnalysisCore): Promise<AnalyzeRepositoryResult>;
