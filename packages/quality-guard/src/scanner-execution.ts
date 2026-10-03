import { execFile } from "node:child_process";

export const asyncExecFile = (
  command: string,
  args: string[],
  options: {
    encoding: "utf8";
    timeout: number;
    maxBuffer: number;
    cwd?: string;
  },
) =>
  new Promise<{ stdout: string }>((resolve, reject) => {
    execFile(command, args, options, (error, stdout) => {
      if (error) {
        Object.assign(error, { stdout: String(stdout) });
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout) });
    });
  });
