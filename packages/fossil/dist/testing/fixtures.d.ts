import { createTemporaryRepository, writeSourceTree } from "./repository-fixtures.js";
import type { TemporaryRepository } from "./types/index.js";
export type { DeterministicClock, OutputCapture, RecordedCommit, TemporaryRepository, } from "./types/index.js";
export { createDeterministicClock } from "./clock-fixtures.js";
export { createOutputCapture } from "./output-fixtures.js";
export declare function temporaryRepository(): Promise<TemporaryRepository>;
export { createTemporaryRepository, writeSourceTree };
