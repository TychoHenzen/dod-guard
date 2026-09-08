export declare const fewerThanFiveCommits: ({
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "added";
        path: string;
    }[];
} | {
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "modified";
        path: string;
    }[];
})[];
export declare const fewerThanThreeLogicalFiles: ({
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "added";
        path: string;
    }[];
} | {
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "renamed";
        previousPath: string;
        path: string;
    }[];
} | {
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "modified";
        path: string;
    }[];
})[];
export declare const exactMinimum: ({
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "added";
        path: string;
    }[];
} | {
    hash: string;
    committerTimestampMs: number;
    changes: {
        status: "modified";
        path: string;
    }[];
})[];
