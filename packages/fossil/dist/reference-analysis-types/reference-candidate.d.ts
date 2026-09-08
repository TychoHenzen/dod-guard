import type { SourceLanguage } from "../types.js";
export interface ReferenceCandidate {
    readonly path: string;
    readonly language: SourceLanguage;
}
