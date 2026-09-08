import { type ChildProcess } from "node:child_process";
import type { GitSpawn } from "./git-process-types/git-spawn.js";
export declare function discoverGitRepository(repositoryPath: string, runGit?: GitSpawn, environment?: NodeJS.ProcessEnv): ChildProcess;
