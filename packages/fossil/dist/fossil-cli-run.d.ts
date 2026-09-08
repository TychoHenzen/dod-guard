import type { FossilCliDependencies } from "./fossil-cli-types/index.js";
/** Parses CLI arguments through the injected analysis boundary. */
export declare function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void>;
