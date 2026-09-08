import type { ReferenceSourceSnapshot } from "./reference-analysis-types.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
export declare function hasStableCapacity(input: StableReadInput): boolean;
export declare function inspectInitialSnapshot(input: StableReadInput): ReferenceSourceSnapshot | undefined;
export declare function initialWithinLimits(input: StableReadInput, initial: ReferenceSourceSnapshot): boolean;
export { inspectCurrentSnapshot } from "./reference-read-stable-snapshots.js";
