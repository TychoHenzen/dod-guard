import type { FossilSubscores } from "./types.js";
import type { FossilScore } from "./fossil-scoring-types/fossil-score.js";
/** Combines all four available fossil subscores using the fixed full-evidence weights. */
export declare function scoreFossilSubscores(subscores: FossilSubscores): FossilScore | undefined;
