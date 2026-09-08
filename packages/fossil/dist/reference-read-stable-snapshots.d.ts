import type { ReferenceSourceSnapshot } from "./reference-analysis-types.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
export declare function inspectCurrentSnapshot(input: StableReadInput, initial: ReferenceSourceSnapshot): ReferenceSourceSnapshot | undefined;
