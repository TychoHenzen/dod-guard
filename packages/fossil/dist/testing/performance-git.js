import { spawn } from "node:child_process";
export function runFastImport(root, input) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["fast-import", "--quiet"], {
            cwd: root,
            stdio: ["pipe", "ignore", "pipe"],
            windowsHide: true,
        });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`git fast-import failed with exit code ${code ?? "unknown"}: ` +
                stderr));
        });
        child.stdin.end(input);
    });
}
export function pointHeadAtImportedBranch(root) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
            cwd: root,
            stdio: "ignore",
            windowsHide: true,
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`git symbolic-ref failed with exit code ${code ?? "unknown"}`));
        });
    });
}
//# sourceMappingURL=performance-git.js.map