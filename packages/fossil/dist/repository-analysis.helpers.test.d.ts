import type { NormalizedAnalysisOptions } from "./types.js";
export declare const analysisOptions: NormalizedAnalysisOptions;
export declare function gitOutput(stdout?: string): {
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    statusRecordCount: number;
};
export interface GitResponse {
    readonly arguments: readonly string[];
    readonly output: ReturnType<typeof gitOutput>;
}
export declare function createRunGit(directory: string, overrides: readonly GitResponse[]): (arguments_: readonly string[]) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
    statusRecordCount: number;
}>;
