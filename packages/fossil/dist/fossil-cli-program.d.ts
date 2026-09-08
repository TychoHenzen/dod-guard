import { Command } from "commander";
import type { FossilCliDependencies } from "./fossil-cli-types/index.js";
/** Creates the command boundary so analysis can be injected in tests. */
export declare function createFossilProgram({ analyze, cwd, stderr, stdout, }: FossilCliDependencies): Command;
