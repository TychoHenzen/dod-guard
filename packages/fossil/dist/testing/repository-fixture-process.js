import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFilePromise = promisify(execFile);
export async function execFileAsync(root, args, options = {}) {
    const result = await execFilePromise("git", [...args], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        ...options,
    });
    return result.stdout;
}
//# sourceMappingURL=repository-fixture-process.js.map