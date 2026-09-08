import type { GitCommit } from "./types.js";
import type { ChangePointSearchInput } from "./git-history-types/index.js";
import { prepareWeightedSimilarity } from "./git-history-change-point-scoring.js";
type WeightedSimilarityInput = ReturnType<typeof prepareWeightedSimilarity>;
export declare function splitChangePoints(input: ChangePointSearchInput, similarityInput: WeightedSimilarityInput): GitCommit[][];
export {};
