import { finalizeFossilReport } from "./output.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
import { validateNormalizedAnalysisOptions } from "./fossil-cli-options.js";
import type {
  RepositoryAnalysisCore,
} from "./fossil-cli-types/repository-analysis-core.js";
import type { AnalyzeRepositoryResult } from "./types.js";

/** Runs the injected core and finalizes report statistics. */
export async function analyzeRepository(
  repositoryPath: string,
  options: unknown,
  core: RepositoryAnalysisCore = analyzeRepositoryCore,
): Promise<AnalyzeRepositoryResult> {
  return finalizeFossilReport(
    await core(repositoryPath, validateNormalizedAnalysisOptions(options)),
  );
}
