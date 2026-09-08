import type { ReferenceCandidate, ReferenceReadResult, ReferenceSourceReader } from "./reference-analysis-types.js";
/** Reads eligible sources without stopping on one unreadable file. */
export declare function readReferenceSources(sources: readonly ReferenceCandidate[], readSource: ReferenceSourceReader): ReferenceReadResult;
