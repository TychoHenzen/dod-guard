import { FossilAnalysisError } from "./analysis-error.js";
import { FossilHelpDisplayed } from "./fossil-cli-types/fossil-help-displayed.js";
import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { runFossilCli } from "./fossil-cli-run.js";
function boundedAnalysisDiagnostic(error) {
    const prefix = "fossil: ";
    const suffix = "\n";
    const maximumMessageBytes = 4_096 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
    let message = "";
    for (const character of error.message || `analysis failed (${error.code})`) {
        const codePoint = character.codePointAt(0) ?? 0;
        const visible = character === "\n"
            ? "\\n"
            : character === "\r"
                ? "\\r"
                : character === "\t"
                    ? "\\t"
                    : codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
                        ? `\\x${codePoint.toString(16).padStart(2, "0")}`
                        : character;
        if (Buffer.byteLength(message) + Buffer.byteLength(visible) > maximumMessageBytes)
            break;
        message += visible;
    }
    return `${prefix}${message}${suffix}`;
}
/** Maps known process outcomes without changing the lower-level CLI boundary. */
export async function runFossilCliProcess(argv, dependencies) {
    try {
        await runFossilCli(argv, dependencies);
        return 0;
    }
    catch (error) {
        if (error instanceof FossilHelpDisplayed)
            return 0;
        if (error instanceof FossilUsageError)
            return error.exitCode;
        if (error instanceof FossilAnalysisError) {
            (dependencies.stderr ?? process.stderr.write.bind(process.stderr))(boundedAnalysisDiagnostic(error));
            return error.code === "invalid_options" ? 2 : 1;
        }
        throw error;
    }
}
//# sourceMappingURL=fossil-cli-process.js.map