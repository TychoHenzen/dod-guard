export interface RecordedCommit {
    readonly hash: string;
    readonly message: string;
    readonly timestamp: Date;
}
export interface TemporaryRepository {
    readonly root: string;
    git(args: readonly string[]): Promise<string>;
    writeSourceFile(relativePath: string, content: string): Promise<void>;
    removeSourcePath(relativePath: string): Promise<void>;
    recordCommit(message: string, timestamp: Date): Promise<RecordedCommit>;
    cleanup(): Promise<void>;
}
/** Creates an isolated Git repository with an identity that never uses host configuration. */
export declare function createTemporaryRepository(): Promise<TemporaryRepository>;
/** Writes every path in a source tree relative to a temporary repository root. */
export declare function writeSourceTree(repository: TemporaryRepository, files: Readonly<Record<string, string>>): Promise<void>;
export interface OutputCapture {
    writeStdout(text: string): void;
    writeStderr(text: string): void;
    stdout(): string;
    stderr(): string;
}
/** Captures output through injected writers without replacing process streams. */
export declare function createOutputCapture(): OutputCapture;
export interface DeterministicClock {
    now(): Date;
    set(time: Date | number): void;
    advance(milliseconds: number): void;
}
/** Provides one mutable, copy-on-read clock for deterministic history and age tests. */
export declare function createDeterministicClock(initialTime: Date | number): DeterministicClock;
