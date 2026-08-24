import { Command } from "commander";
import { FossilAnalysisError } from "./analysis-error.js";
import type { AnalyzeRepositoryResult, NormalizedAnalysisOptions } from "./types.js";
export { FossilAnalysisError } from "./analysis-error.js";
export * from "./types.js";
/** Default analysis options. An empty extension list includes every extension. */
export declare const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS: NormalizedAnalysisOptions;
export type RepositoryAnalysisCore = (repositoryPath: string, options: NormalizedAnalysisOptions) => Promise<AnalyzeRepositoryResult>;
export type AnalyzeCommandHandler = RepositoryAnalysisCore;
/** A command-line usage failure that callers map to the standard usage exit code. */
export declare class FossilUsageError extends Error {
    readonly reported: boolean;
    readonly exitCode = 2;
    constructor(message: string, reported?: boolean);
}
/** A compatibility wrapper for the dedicated non-repository analysis failure. */
export declare class NotRepositoryAnalysisError extends FossilAnalysisError {
    constructor(message?: string);
}
export interface FossilCliDependencies {
    readonly analyze: AnalyzeCommandHandler;
    readonly cwd?: () => string;
    readonly stderr?: (message: string) => void;
    readonly stdout?: (message: string) => void;
}
/** Runs the injected repository-analysis core and finalizes report-level statistics. */
export declare function analyzeRepository(repositoryPath: string, options: unknown, core?: RepositoryAnalysisCore): Promise<AnalyzeRepositoryResult>;
/** Creates the command boundary so analysis can be injected and tested without Git access. */
export declare function createFossilProgram({ analyze, cwd, stderr, stdout, }: FossilCliDependencies): Command;
/** Parses a CLI argument vector through the injected analysis command boundary. */
export declare function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void>;
/** Maps known process outcomes without changing the lower-level CLI boundary. */
export declare function runFossilCliProcess(argv: readonly string[], dependencies: FossilCliDependencies): Promise<number>;
