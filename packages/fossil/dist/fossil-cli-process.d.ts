import type { FossilCliDependencies } from "./fossil-cli-types/fossil-cli-dependencies.js";
/** Maps known process outcomes without changing the lower-level CLI boundary. */
export declare function runFossilCliProcess(argv: readonly string[], dependencies: FossilCliDependencies): Promise<number>;
