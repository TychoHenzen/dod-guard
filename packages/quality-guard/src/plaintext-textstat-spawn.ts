import type { SpawnSyncReturns } from "node:child_process";

export type Spawn = (
  command: string,
  args: string[],
  options: {
    encoding: "utf8";
    input: string;
    timeout: number;
    windowsHide: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => SpawnSyncReturns<string>;
