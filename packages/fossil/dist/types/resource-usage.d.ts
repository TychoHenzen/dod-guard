export interface ResourceUsage {
    readonly commitRecords: number;
    readonly fileStatusRecords: number;
    readonly inventoriedFiles: number;
    readonly gitStdoutBytes: number;
    readonly gitStderrBytes: number;
    readonly referenceBytes: number;
    readonly omittedReferencePaths: number;
}
