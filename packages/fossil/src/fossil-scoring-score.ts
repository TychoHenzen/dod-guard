import type { FossilSubscores } from "./types.js";
import type { FossilScore } from "./fossil-scoring-types/fossil-score.js";

/** Combines all four available fossil subscores using the fixed full-evidence weights. */
export function scoreFossilSubscores(subscores: FossilSubscores): FossilScore | undefined {
  if (subscores.referenceWeakness === undefined && subscores.clusterIsolation === undefined) {
    return {
      score: (0.3 / 0.65) * subscores.churn + (0.35 / 0.65) * subscores.abandonment,
      basis: "git-only",
    };
  }
  if (subscores.referenceWeakness === undefined || subscores.clusterIsolation === undefined) return undefined;
  return {
    score:
      0.3 * subscores.churn +
      0.35 * subscores.abandonment +
      0.2 * subscores.referenceWeakness +
      0.15 * subscores.clusterIsolation,
    basis: "full",
  };
}
