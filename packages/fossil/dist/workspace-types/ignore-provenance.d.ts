import type { IgnoreSource } from "../types.js";
export interface IgnoreProvenance {
    readonly path: string;
    readonly rule: string;
    readonly source: IgnoreSource;
}
