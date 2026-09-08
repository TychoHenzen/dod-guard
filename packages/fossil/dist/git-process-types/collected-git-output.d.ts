export interface CollectedGitOutput {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly stdoutBytes: number;
    readonly stderrBytes: number;
    readonly statusRecordCount: number;
}
