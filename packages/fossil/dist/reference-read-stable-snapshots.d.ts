import type { ReferenceSourceSnapshot } from "./reference-analysis-types/reference-source-snapshot.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
export declare function inspectCurrentSnapshot(input: StableReadInput, initial: ReferenceSourceSnapshot): ReferenceSourceSnapshot | undefined;
