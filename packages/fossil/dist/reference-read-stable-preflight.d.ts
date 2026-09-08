import type { ReferenceSourceSnapshot } from "./reference-analysis-types/reference-source-snapshot.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
export declare function hasStableCapacity(input: StableReadInput): boolean;
export declare function inspectInitialSnapshot(input: StableReadInput): ReferenceSourceSnapshot | undefined;
export declare function initialWithinLimits(input: StableReadInput, initial: ReferenceSourceSnapshot): boolean;
export declare function inspectCurrentSnapshot(input: StableReadInput, initial: ReferenceSourceSnapshot): ReferenceSourceSnapshot | undefined;
