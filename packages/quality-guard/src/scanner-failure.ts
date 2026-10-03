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

function parsedFailure(error: unknown) {
  const failure = error as Record<string, unknown>;
  const stdout = failure.stdout;
  if (typeof stdout !== "string") return undefined;
  if (!stdout.trim()) return undefined;
  const status = typeof failure.status === "number" ? failure.status : 1;
  return { exitCode: status, report: JSON.parse(stdout) };
}

function failureMessage(error: unknown): string {
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" ? message : String(error);
}

export function scanFailure(error: unknown) {
  const result = parsedFailure(error);
  if (result) return result;
  throw new Error(`quality scan failed: ${failureMessage(error)}`);
}
