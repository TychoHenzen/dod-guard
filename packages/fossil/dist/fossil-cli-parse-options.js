import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { DEFAULT_NORMALIZED_ANALYSIS_OPTIONS, validateNormalizedAnalysisOptions } from "./fossil-cli-options.js";
function commaSeparatedValues(value) {
    return value === undefined
        ? []
        : value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
}
function finiteNumber(value, fallback, option, minimum, maximum) {
    if (value === undefined)
        return fallback;
    const number = Number(value);
    if (value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum)
        return number;
    throw new FossilUsageError(`${option} must be a finite number from ${minimum} through ${maximum}.`);
}
export function normalizeAnalyzeOptions(options) {
    const extensions = commaSeparatedValues(options.extensions);
    const format = options.format ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
    if (format !== "table" && format !== "json")
        throw new FossilUsageError("--format must be table or json.");
    if (extensions.length > 64)
        throw new FossilUsageError("--extensions accepts at most 64 nonempty values.");
    return validateNormalizedAnalysisOptions({
        days: finiteNumber(options.days, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.days, "--days", 1, 3650),
        gapHours: finiteNumber(options.gapHours, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.gapHours, "--gap-hours", 1, 8760),
        threshold: finiteNumber(options.threshold, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.threshold, "--threshold", 0, 1),
        format,
        extensions,
        untrackedAgeDays: finiteNumber(options.untrackedAge, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.untrackedAgeDays, "--untracked-age", 1, 3650),
        exclude: commaSeparatedValues(options.exclude),
        verbose: options.verbose ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.verbose,
    });
}
//# sourceMappingURL=fossil-cli-parse-options.js.map