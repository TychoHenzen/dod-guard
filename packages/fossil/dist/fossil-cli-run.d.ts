import type { FossilCliDependencies } from "./fossil-cli-types/fossil-cli-dependencies.js";
/** Parses a CLI argument vector through the injected analysis command boundary. */
export declare function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void>;
