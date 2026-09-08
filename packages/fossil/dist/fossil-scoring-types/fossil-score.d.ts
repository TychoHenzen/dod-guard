import type { ScoreBasis } from "../types.js";
/** Numeric fossil score with the evidence basis used to compute it. */
export interface FossilScore {
    readonly score: number;
    readonly basis: ScoreBasis;
}
