export interface LogicalFileActivity {
    readonly identity: string;
    readonly currentPath?: string;
    readonly paths: readonly string[];
    readonly firstCommitTimestampMs: number;
    readonly lastCommitTimestampMs: number;
    readonly commitCount: number;
    readonly created: boolean;
    readonly deleted: boolean;
    readonly existsAtHead: boolean;
}
