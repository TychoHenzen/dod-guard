import type { AnalysisWarning, SourceSpan } from "./types.js";
export declare const MODULE_EXTENSIONS: readonly [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
export declare function compareText(left: string, right: string): number;
export declare function sourceSpan(content: string, start: number, end: number): SourceSpan;
export declare function targetCandidates(sourcePath: string, specifier: string): string[];
export declare function normalizedPath(path: string): string;
export declare function pathIsWithin(root: string, candidate: string): boolean;
export declare function isOutsideRepositoryPath(path: string): boolean;
export declare function outsideBoundaryWarning(sourcePath: string): AnalysisWarning;
