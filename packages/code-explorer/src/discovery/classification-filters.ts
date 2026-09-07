import type { PathClassification } from "./path-classification.js";
import type { ClassificationCandidate } from "./classification-candidate.js";
import { safeGlobMatches } from "./classification-matching.js";

export type DiscoveryFilterOptions = {
  path_globs?: readonly string[];
  language?: string;
  languages?: readonly string[];
  kind?: string;
  kinds?: readonly string[];
  content?: "all" | "production" | "tests";
  include_generated?: boolean;
};

function matchesPath(path: string, filters: DiscoveryFilterOptions): boolean {
  return (
    !filters.path_globs?.length ||
    filters.path_globs.some((glob) => safeGlobMatches(path, glob))
  );
}

function filterValues(
  values: readonly string[] | undefined,
  value: string | undefined,
): readonly string[] | undefined {
  return values ?? (value === undefined ? undefined : [value]);
}

function matchesValue(
  value: string | undefined,
  values: readonly string[] | undefined,
): boolean {
  if (!values?.length) return true;
  return value !== undefined && values.includes(value);
}

function matchesLanguage(
  filters: DiscoveryFilterOptions,
  candidate: ClassificationCandidate,
): boolean {
  return matchesValue(
    candidate.language,
    filterValues(filters.languages, filters.language),
  );
}

function matchesKind(
  filters: DiscoveryFilterOptions,
  candidate: ClassificationCandidate,
): boolean {
  return matchesValue(
    candidate.kind,
    filterValues(filters.kinds, filters.kind),
  );
}

function matchesContent(
  classification: PathClassification,
  filters: DiscoveryFilterOptions,
): boolean {
  if (classification.content === "generated" && !filters.include_generated)
    return false;
  if (filters.content === "production")
    return classification.content === "production";
  if (filters.content === "tests") return classification.content === "test";
  return true;
}

export function matchesDiscoveryFilters(
  ...args: [
    path: string,
    classification: PathClassification,
    filters: DiscoveryFilterOptions,
    candidate: ClassificationCandidate,
  ]
): boolean {
  const [path, classification, filters, candidate] = args;
  return (
    matchesPath(path, filters) &&
    matchesLanguage(filters, candidate) &&
    matchesKind(filters, candidate) &&
    matchesContent(classification, filters)
  );
}
