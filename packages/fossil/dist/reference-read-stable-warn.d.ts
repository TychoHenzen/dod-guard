import type { AnalysisWarning } from "./types.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
export declare function warnStableRead(input: StableReadInput, code: AnalysisWarning["code"], message: string): void;
