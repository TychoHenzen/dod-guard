import type { RecordedCommit } from "./recorded-commit.js";
export interface TemporaryRepository {
    readonly root: string;
    git(args: readonly string[]): Promise<string>;
    writeSourceFile(relativePath: string, content: string): Promise<void>;
    removeSourcePath(relativePath: string): Promise<void>;
    recordCommit(message: string, timestamp: Date): Promise<RecordedCommit>;
    cleanup(): Promise<void>;
}
