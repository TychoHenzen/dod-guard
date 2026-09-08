import type { ChildProcess } from "node:child_process";
import type { GitSpawnOptions } from "./git-spawn-options.js";

export type GitSpawn = (
  command: string,
  arguments_: readonly string[],
  options: GitSpawnOptions,
) => ChildProcess;
