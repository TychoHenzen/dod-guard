import { FossilAnalysisError } from "./analysis-error.js";
import type { NormalizedAnalysisOptions } from "./types.js";

const DEFAULT_DAYS = 90;
const DEFAULT_GAP_HOURS = 48;
const DEFAULT_THRESHOLD = 0.4;
const DEFAULT_UNTRACKED_AGE_DAYS = 90;

/** Default analysis options. An empty extension list includes every extension. */
export const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS: NormalizedAnalysisOptions = {
  days: DEFAULT_DAYS,
  gapHours: DEFAULT_GAP_HOURS,
  threshold: DEFAULT_THRESHOLD,
  format: "table",
  extensions: [],
  untrackedAgeDays: DEFAULT_UNTRACKED_AGE_DAYS,
  exclude: [],
  verbose: false,
};

function validNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isOptionsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function validStringCollection(value: unknown, maximumLength: number): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximumLength && value.every((item) => typeof item === "string");
}

/** Validates direct API options and returns fresh collections for each analysis. */
export function validateNormalizedAnalysisOptions(options: unknown): NormalizedAnalysisOptions {
  if (
    !(
      isOptionsRecord(options) &&
      validNumber(options.days, 1, 3650) &&
      validNumber(options.gapHours, 1, 8760) &&
      validNumber(options.threshold, 0, 1) &&
      validNumber(options.untrackedAgeDays, 1, 3650) &&
      (options.format === "table" || options.format === "json") &&
      validStringCollection(options.extensions, 64) &&
      options.extensions.every((extension) => extension.length > 0) &&
      validStringCollection(options.exclude, Number.MAX_SAFE_INTEGER) &&
      typeof options.verbose === "boolean"
    )
  )
    throw new FossilAnalysisError({ code: "invalid_options", message: "Analysis options are invalid." });
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
