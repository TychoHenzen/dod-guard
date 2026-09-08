import { analyzeReferences, type ReferenceSourceContent } from "./ref-analyzer.js";
export declare function normalizedRepositoryPath(path: string): string;
export declare function basename(path: string): string;
export declare function hasGraphUsage(graph: ReturnType<typeof analyzeReferences>, candidate: string): boolean;
export declare function sourceUsesCandidate(input: {
    source: ReferenceSourceContent;
    candidate: string;
    candidateBasename: string;
    basenameCount: number;
}): boolean;
