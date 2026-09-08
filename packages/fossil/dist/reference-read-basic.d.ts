import type { ReferenceReadResult } from "./reference-analysis-types/reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export declare function readReferenceSources(sources: readonly ReferenceCandidate[], readSource: ReferenceSourceReader): ReferenceReadResult;
