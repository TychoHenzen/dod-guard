import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TARGET_PERFORMANCE_FIXTURE } from "./performance-constants.js";
import { pointHeadAtImportedBranch, runFastImport } from "./performance-git.js";
function sourcePath(index) {
    return `src/file-${index.toString().padStart(4, "0")}.ts`;
}
/** Builds deterministic fast-import input with later source updates. */
export function fastImportStream({ commitCount, fileCount, }) {
    if (commitCount < fileCount || fileCount < 1)
        throw new RangeError("Performance fixture requires at least one commit per file.");
    const records = [];
    for (let index = 0; index < commitCount; index += 1) {
        const message = `commit ${index}`;
        const content = `export const revision = ${index};\n`;
        records.push(`commit refs/heads/main\n` +
            `author Fossil Fixture <fossil-fixture@example.invalid> ` +
            `${1_735_689_600 + index} +0000\n` +
            `committer Fossil Fixture <fossil-fixture@example.invalid> ` +
            `${1_735_689_600 + index} +0000\n` +
            `data ${Buffer.byteLength(message)}\n${message}\n` +
            `M 100644 inline ${sourcePath(index % fileCount)}\n` +
            `data ${Buffer.byteLength(content)}\n${content}`);
    }
    return `${records.join("")}done\n`;
}
/** Creates the target-size repository through Git fast-import. */
export async function createPerformanceFixture(spec = TARGET_PERFORMANCE_FIXTURE) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-performance-"));
    try {
        await new Promise((resolve, reject) => {
            const child = spawn("git", ["init", "--quiet"], {
                cwd: root,
                stdio: "ignore",
                windowsHide: true,
            });
            child.once("error", reject);
            child.once("close", (code) => code === 0
                ? resolve()
                : reject(new Error(`git init failed with exit code ${code}`)));
        });
        await runFastImport(root, fastImportStream(spec));
        await pointHeadAtImportedBranch(root);
        return {
            root,
            ...spec,
            cleanup: () => fs.rm(root, { recursive: true, force: true }),
        };
    }
    catch (error) {
        await fs.rm(root, { recursive: true, force: true });
        throw error;
    }
}
//# sourceMappingURL=performance-fixture.js.map