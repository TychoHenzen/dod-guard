/**
 * Types for the hook-side sentinel module.
 *
 * The hook runs as plain `.mjs`, because a PostToolUse command cannot depend
 * on a build step. This declaration lets the TypeScript server import its
 * constants so the two sides stay pinned to the same paths.
 */

export declare const SENTINEL_NAME: string;
export declare const SKIP_LOG: string;

export interface SentinelIntent {
  rebaseline: boolean;
}

export interface SkipRecord {
  file: string;
  reasons?: string[];
  rebaseline?: boolean;
  at?: string;
  acknowledged?: boolean;
}

export declare function readSentinel(repoRoot: string): SentinelIntent | null;
export declare function deleteSentinel(repoRoot: string): void;
export declare function readSkipLog(repoRoot: string): SkipRecord[];
export declare function recordConsumption(repoRoot: string, entry: Partial<SkipRecord>): SkipRecord;
export declare function unacknowledged(repoRoot: string): SkipRecord[];
