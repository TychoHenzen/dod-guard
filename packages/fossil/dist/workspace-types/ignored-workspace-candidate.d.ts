import type { IgnoreSource } from "../types.js";
export interface IgnoredWorkspaceCandidate {
    readonly path: string;
    readonly kind: "ignored";
    readonly modifiedTimestampMs: number;
    readonly ignore: {
        readonly rule: string;
        readonly source: IgnoreSource;
    };
}
