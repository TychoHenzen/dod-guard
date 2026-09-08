import { type Command } from "commander";
import type { RawAnalyzeOptions } from "./fossil-cli-types/index.js";
export declare function addAnalyzeCommand(program: Command, action: (repositoryPath: string | undefined, options: RawAnalyzeOptions) => Promise<void>): void;
