import type { Evidence } from "../types.js";
import { bugErrors, failureErrors, timingErrors } from "./validate-links.js";
import {
  coverageErrors,
  factsFor,
  sourceErrors,
  testErrors,
} from "./validate-structure.js";

export function validateEvidence(evidence: Evidence): string[] {
  const facts = factsFor(evidence);
  return [
    ...sourceErrors(evidence),
    ...testErrors(evidence, facts),
    ...coverageErrors(evidence, facts),
    ...bugErrors(evidence, facts),
    ...failureErrors(evidence, facts),
    ...timingErrors(evidence),
  ]
    .filter((error, index, errors) => errors.indexOf(error) === index)
    .sort();
}
