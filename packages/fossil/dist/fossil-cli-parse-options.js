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
function validNumberText({ value, number, minimum, maximum }) {
    return value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum;
}
function finiteNumber({ value, fallback, option, minimum, maximum }) {
    if (value === undefined)
        return fallback;
    const number = Number(value);
    if (validNumberText({ value, number, minimum, maximum }))
        return number;
    throw new FossilUsageError(`${option} must be a finite number from ${minimum} through ${maximum}.`);
}
function formatOption(value) {
    const format = value ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
    if (format !== "table" && format !== "json")
        throw new FossilUsageError("--format must be table or json.");
    return format;
}
function extensionOptions(value) {
    const extensions = commaSeparatedValues(value);
    if (extensions.length > 64)
        throw new FossilUsageError("--extensions accepts at most 64 nonempty values.");
    return extensions;
}
function normalizedNumberOptions(options) {
    const defaults = DEFAULT_NORMALIZED_ANALYSIS_OPTIONS;
    return {
        days: finiteNumber({ value: options.days, fallback: defaults.days, option: "--days", minimum: 1, maximum: 3650 }),
        gapHours: finiteNumber({ value: options.gapHours, fallback: defaults.gapHours, option: "--gap-hours", minimum: 1, maximum: 8760 }),
        threshold: finiteNumber({ value: options.threshold, fallback: defaults.threshold, option: "--threshold", minimum: 0, maximum: 1 }),
        untrackedAgeDays: finiteNumber({
            value: options.untrackedAge,
            fallback: defaults.untrackedAgeDays,
            option: "--untracked-age",
            minimum: 1,
            maximum: 3650,
        }),
    };
}
export function normalizeAnalyzeOptions(options) {
    const extensions = extensionOptions(options.extensions);
    const format = formatOption(options.format);
    const numeric = normalizedNumberOptions(options);
    return validateNormalizedAnalysisOptions({
        ...numeric,
        format,
        extensions,
        exclude: commaSeparatedValues(options.exclude),
        verbose: options.verbose ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.verbose,
    });
}
//# sourceMappingURL=fossil-cli-parse-options.js.map