import { FossilUsageError } from "./fossil-cli-types/index.js";
import { DEFAULT_NORMALIZED_ANALYSIS_OPTIONS } from "./fossil-cli-options.js";
function validNumberText(input, number) {
    return (input.value?.trim() !== "" &&
        Number.isFinite(number) &&
        number >= input.minimum &&
        number <= input.maximum);
}
function finiteNumber(input) {
    if (input.value === undefined)
        return input.fallback;
    const number = Number(input.value);
    if (validNumberText(input, number))
        return number;
    throw new FossilUsageError(`${input.option} must be a finite number from ${input.minimum} ` +
        `through ${input.maximum}.`);
}
function numericOptions(options) {
    const defaults = DEFAULT_NORMALIZED_ANALYSIS_OPTIONS;
    const inputs = [
        [options.days, defaults.days, "--days", 1, 3650],
        [options.gapHours, defaults.gapHours, "--gap-hours", 1, 8760],
        [options.threshold, defaults.threshold, "--threshold", 0, 1],
        [
            options.untrackedAge,
            defaults.untrackedAgeDays,
            "--untracked-age",
            1,
            3650,
        ],
    ];
    const values = inputs.map(([value, fallback, option, minimum, maximum]) => finiteNumber({ value, fallback, option, minimum, maximum }));
    return {
        days: values[0],
        gapHours: values[1],
        threshold: values[2],
        untrackedAgeDays: values[3],
    };
}
export function normalizedNumberOptions(options) {
    return numericOptions(options);
}
//# sourceMappingURL=fossil-cli-number-options.js.map