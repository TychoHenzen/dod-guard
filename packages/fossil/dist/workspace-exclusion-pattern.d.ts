export declare function patternToken(pattern: string, index: number): {
    character: string;
    recursiveWildcard: boolean;
    nextIndex: number;
};
export declare function applyPattern(path: string, token: ReturnType<typeof patternToken>, previous: readonly boolean[]): boolean[];
export declare function globResult(previous: readonly boolean[], path: string): boolean;
