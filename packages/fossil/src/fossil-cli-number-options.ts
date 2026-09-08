import { FossilUsageError } from "./fossil-cli-types/index.js";
import { DEFAULT_NORMALIZED_ANALYSIS_OPTIONS } from "./fossil-cli-options.js";
import type { RawAnalyzeOptions } from "./fossil-cli-types/index.js";
import type { NormalizedAnalysisOptions } from "./types.js";

interface FiniteNumberInput {
  value: string | undefined;
  fallback: number;
  option: string;
  minimum: number;
  maximum: number;
}

function validNumberText(input: FiniteNumberInput, number: number): boolean {
  return (
    input.value?.trim() !== "" &&
    Number.isFinite(number) &&
    number >= input.minimum &&
    number <= input.maximum
  );
}

function finiteNumber(input: FiniteNumberInput): number {
  if (input.value === undefined) return input.fallback;
  const number = Number(input.value);
  if (validNumberText(input, number)) return number;
  throw new FossilUsageError(
    `${input.option} must be a finite number from ${input.minimum} ` +
      `through ${input.maximum}.`,
  );
}

function numericOptions(options: RawAnalyzeOptions) {
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
  ] as const;
  const values = inputs.map(([value, fallback, option, minimum, maximum]) =>
    finiteNumber({ value, fallback, option, minimum, maximum }),
  ) as [number, number, number, number];
  return {
    days: values[0],
    gapHours: values[1],
    threshold: values[2],
    untrackedAgeDays: values[3],
  };
}

export function normalizedNumberOptions(
  options: RawAnalyzeOptions,
): Pick<
  NormalizedAnalysisOptions,
  "days" | "gapHours" | "threshold" | "untrackedAgeDays"
> {
  return numericOptions(options);
}
