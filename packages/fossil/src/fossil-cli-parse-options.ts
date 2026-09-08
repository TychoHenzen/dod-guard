import { FossilUsageError } from "./fossil-cli-types/index.js";
import type { RawAnalyzeOptions } from "./fossil-cli-types/index.js";
import {
  DEFAULT_NORMALIZED_ANALYSIS_OPTIONS,
  validateNormalizedAnalysisOptions,
} from "./fossil-cli-options.js";
import { normalizedNumberOptions } from "./fossil-cli-number-options.js";
import type { NormalizedAnalysisOptions } from "./types.js";

function commaSeparatedValues(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function formatOption(
  value: string | undefined,
): NormalizedAnalysisOptions["format"] {
  const format = value ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
  if (format !== "table" && format !== "json")
    throw new FossilUsageError("--format must be table or json.");
  return format;
}

function extensionOptions(value: string | undefined): string[] {
  const extensions = commaSeparatedValues(value);
  if (extensions.length > 64)
    throw new FossilUsageError(
      "--extensions accepts at most 64 nonempty values.",
    );
  return extensions;
}

export function normalizeAnalyzeOptions(
  options: RawAnalyzeOptions,
): NormalizedAnalysisOptions {
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
