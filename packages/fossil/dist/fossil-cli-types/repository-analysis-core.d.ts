import type { AnalyzeRepositoryResult, NormalizedAnalysisOptions } from "../types.js";
export type RepositoryAnalysisCore = (repositoryPath: string, options: NormalizedAnalysisOptions) => Promise<AnalyzeRepositoryResult>;
