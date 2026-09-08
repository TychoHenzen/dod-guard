import { FossilAnalysisError } from "./analysis-error.js";
const DEFAULT_DAYS = 90;
const DEFAULT_GAP_HOURS = 48;
const DEFAULT_THRESHOLD = 0.4;
const DEFAULT_UNTRACKED_AGE_DAYS = 90;
/** Default analysis options. Empty extensions include every extension. */
export const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS = {
    days: DEFAULT_DAYS,
    gapHours: DEFAULT_GAP_HOURS,
    threshold: DEFAULT_THRESHOLD,
    format: "table",
    extensions: [],
    untrackedAgeDays: DEFAULT_UNTRACKED_AGE_DAYS,
    exclude: [],
    verbose: false,
};
function validNumber(value, minimum, maximum) {
    return (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum);
}
function isOptionsRecord(value) {
    return value !== null && typeof value === "object";
}
function validStringCollection(value, maximumLength) {
    return (Array.isArray(value) &&
        value.length <= maximumLength &&
        value.every((item) => typeof item === "string"));
}
function validAnalysisNumbers(options) {
    return (validNumber(options.days, 1, 3650) &&
        validNumber(options.gapHours, 1, 8760) &&
        validNumber(options.threshold, 0, 1) &&
        validNumber(options.untrackedAgeDays, 1, 3650));
}
function validAnalysisFormat(options) {
    return options.format === "table" || options.format === "json";
}
function validAnalysisCollections(options) {
    if (!validStringCollection(options.extensions, 64))
        return false;
    if (!options.extensions.every((extension) => extension.length > 0))
        return false;
    if (!validStringCollection(options.exclude, Number.MAX_SAFE_INTEGER))
        return false;
    return typeof options.verbose === "boolean";
}
function isValidNormalizedAnalysisOptions(value) {
    if (!isOptionsRecord(value))
        return false;
    return (validAnalysisNumbers(value) &&
        validAnalysisFormat(value) &&
        validAnalysisCollections(value));
}
/** Validates direct API options and returns fresh collections. */
export function validateNormalizedAnalysisOptions(options) {
    if (!isValidNormalizedAnalysisOptions(options))
        throw new FossilAnalysisError({
            code: "invalid_options",
            message: "Analysis options are invalid.",
        });
    return {
        days: options.days,
        gapHours: options.gapHours,
        threshold: options.threshold,
        format: options.format,
        extensions: [...options.extensions],
        untrackedAgeDays: options.untrackedAgeDays,
        exclude: [...options.exclude],
        verbose: options.verbose,
    };
}
//# sourceMappingURL=fossil-cli-options.js.map