import { type TemporaryRepository } from "./testing/fixtures.js";
export declare function temporaryRepository(): Promise<TemporaryRepository>;
export declare function changePointCommits(fileSets: readonly (readonly string[])[], gapsBefore: ReadonlyMap<number, number>): {
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "modified";
        path: string;
    }[];
}[];
export declare function changePointPartitionLengths(fileSets: readonly (readonly string[])[], gapsBefore: ReadonlyMap<number, number>): number[];
export declare const maximumFileActivity: {
    identity: string;
    path: string;
    burstCommits: number;
    postBurstCommits: number;
    createdInBurst: boolean;
    existsAtHead: boolean;
};
