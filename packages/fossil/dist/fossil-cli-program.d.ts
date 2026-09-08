import { Command } from "commander";
import type { FossilCliDependencies } from "./fossil-cli-types/fossil-cli-dependencies.js";
/** Creates the command boundary so analysis can be injected and tested without Git access. */
export declare function createFossilProgram({ analyze, cwd, stderr, stdout, }: FossilCliDependencies): Command;
