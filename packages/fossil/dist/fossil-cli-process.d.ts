import type { FossilCliDependencies } from "./fossil-cli-types/index.js";
/** Maps known process outcomes without changing the CLI boundary. */
export declare function runFossilCliProcess(argv: readonly string[], dependencies: FossilCliDependencies): Promise<number>;
