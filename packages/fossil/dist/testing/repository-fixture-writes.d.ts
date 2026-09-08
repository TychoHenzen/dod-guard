import type { RecordedCommit } from "./types/recorded-commit.js";
export declare function writeFixtureSource(root: string, relativePath: string, content: string): Promise<void>;
export declare function removeFixtureSource(root: string, relativePath: string): Promise<void>;
export declare function recordFixtureCommit(input: {
    root: string;
    message: string;
    timestamp: Date;
}): Promise<RecordedCommit>;
