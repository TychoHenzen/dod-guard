/**
 * fossil CLI entry point. CLI-only - there is no MCP server here, unlike the
 * sibling dod-guard and quality-guard packages. The isMainModule() guard
 * still matters: it lets tests import this module without triggering
 * process.exit.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runFossilCliProcess } from "./fossil-cli-process.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
export { FossilAnalysisError } from "./analysis-error.js";
export { DEFAULT_NORMALIZED_ANALYSIS_OPTIONS } from "./fossil-cli-options.js";
export { analyzeRepository } from "./fossil-cli-analysis.js";
export { createFossilProgram } from "./fossil-cli-program.js";
export { runFossilCli } from "./fossil-cli-run.js";
export { runFossilCliProcess } from "./fossil-cli-process.js";
export { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
export { NotRepositoryAnalysisError } from "./fossil-cli-types/not-repository-analysis-error.js";
export * from "./types.js";
const _filename = fileURLToPath(import.meta.url);
function isMainModule() {
    const arg = process.argv[1];
    if (!arg)
        return false;
    try {
        return realpathSync(arg) === realpathSync(_filename);
    }
    catch {
        return arg === _filename;
    }
}
async function main() {
    process.exitCode = await runFossilCliProcess(process.argv, { analyze: analyzeRepositoryCore });
}
if (isMainModule()) {
    main().catch((err) => {
        process.stderr.write(`fossil CLI failed: ${err}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=fossil-cli-core.js.map