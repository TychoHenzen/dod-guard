import type { AnalysisWarning } from "./types.js";
import type {
  ReferenceCandidate,
  ReferenceSourceContent,
} from "./reference-analysis-types.js";
export {
  emptyReferenceGraph,
  finishBoundedReferenceRead,
  sortReferenceReadEvidence,
} from "./reference-read-evidence.js";

interface ReferenceWarningInput {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
  source: ReferenceCandidate;
  code: AnalysisWarning["code"];
  message: string;
}

const UNREADABLE_REFERENCE_WARNING = {
  code: "reference_unreadable" as const,
  message: "Reference source could not be read.",
};
const BINARY_REFERENCE_WARNING = {
  code: "reference_binary" as const,
  message: "Reference source is binary.",
};

export function addReferenceWarning(input: ReferenceWarningInput): void {
  input.unavailablePaths.push(input.source.path);
  input.warnings.push({
    code: input.code,
    message: input.message,
    path: input.source.path,
  });
}

function addTypedReferenceWarning(input: ReferenceWarningInput): void {
  addReferenceWarning(input);
}

export function addUnreadableReferenceWarning(
  input: Pick<
    ReferenceWarningInput,
    "unavailablePaths" | "warnings" | "source"
  >,
): void {
  addTypedReferenceWarning({
    ...input,
    ...UNREADABLE_REFERENCE_WARNING,
  });
}

export function addBinaryReferenceWarning(
  input: Pick<
    ReferenceWarningInput,
    "unavailablePaths" | "warnings" | "source"
  >,
): void {
  addTypedReferenceWarning(Object.assign({}, input, BINARY_REFERENCE_WARNING));
}

export function newReferenceReadCollections() {
  return {
    readableSources: [] as ReferenceSourceContent[],
    unavailablePaths: [] as string[],
    warnings: [] as AnalysisWarning[],
  };
}

export function newReferenceReadBudget() {
  return { acceptedBytes: 0, totalLimitReached: false };
}
