import type { ReferenceGraph } from "./types.js";
export declare function edgeSummary(graph: ReferenceGraph): {
    sourcePath: string;
    targetPath: string;
    language: import("./types.js").SourceLanguage;
    kind: import("./types.js").ReferenceKind;
    strength: import("./types.js").ReferenceStrength;
}[];
