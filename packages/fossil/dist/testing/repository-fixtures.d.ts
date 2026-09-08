import type { TemporaryRepository } from "./types/temporary-repository.js";
/** Creates an isolated Git repository with an identity that never uses host configuration. */
export declare function createTemporaryRepository(): Promise<TemporaryRepository>;
/** Writes every path in a source tree relative to a temporary repository root. */
export declare function writeSourceTree(repository: TemporaryRepository, files: Readonly<Record<string, string>>): Promise<void>;
