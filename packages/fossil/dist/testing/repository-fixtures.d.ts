import type { TemporaryRepository } from "./types/temporary-repository.js";
/** Creates an isolated Git repository without host configuration. */
export declare function createTemporaryRepository(): Promise<TemporaryRepository>;
/** Writes every source-tree path relative to the repository root. */
export declare function writeSourceTree(repository: TemporaryRepository, files: Readonly<Record<string, string>>): Promise<void>;
