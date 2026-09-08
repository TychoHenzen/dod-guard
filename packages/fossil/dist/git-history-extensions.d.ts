import type { GitCommit } from "./types.js";
/** Normalizes extensions while preserving first-occurrence order. */
export declare function normalizeExtensions(values: readonly string[]): string[];
/** Keeps whole candidate identities for later burst and score calculations. */
export declare function filterHistoryByExtensions(commits: readonly GitCommit[], extensions: ReadonlySet<string>): GitCommit[];
