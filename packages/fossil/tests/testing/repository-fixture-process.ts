import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);

export async function execFileAsync(
  root: string,
  args: readonly string[],
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const result = await execFilePromise("git", [...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  return result.stdout;
}
