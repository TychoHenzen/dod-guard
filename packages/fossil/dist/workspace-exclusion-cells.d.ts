export declare function patternCell({ character, recursiveWildcard, path, pathIndex, previous, current, }: {
    character: string | undefined;
    recursiveWildcard: boolean;
    path: string;
    pathIndex: number;
    previous: readonly boolean[];
    current: readonly boolean[];
}): boolean;
