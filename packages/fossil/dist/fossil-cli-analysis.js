import { finalizeFossilReport } from "./output.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
import { validateNormalizedAnalysisOptions } from "./fossil-cli-options.js";
/** Runs the injected core and finalizes report statistics. */
export async function analyzeRepository(repositoryPath, options, core = analyzeRepositoryCore) {
    return finalizeFossilReport(await core(repositoryPath, validateNormalizedAnalysisOptions(options)));
}
//# sourceMappingURL=fossil-cli-analysis.js.map