import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execFileAsync } from "./repository-fixture-process.js";
function toGitTimestamp(timestamp) {
    return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function sourceTarget(root, relativePath) {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Fixture path must stay within the repository: ${relativePath}`);
    }
    return target;
}
export async function writeFixtureSource(root, relativePath, content) {
    const target = sourceTarget(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
}
export async function removeFixtureSource(root, relativePath) {
    await fs.rm(sourceTarget(root, relativePath), {
        recursive: true,
        force: true,
    });
}
export async function recordFixtureCommit(input) {
    const gitTimestamp = toGitTimestamp(input.timestamp);
    await execFileAsync(input.root, ["add", "--all"]);
    await execFileAsync(input.root, ["commit", "--quiet", "--message", input.message], {
        env: {
            ...process.env,
            GIT_AUTHOR_DATE: gitTimestamp,
            GIT_COMMITTER_DATE: gitTimestamp,
        },
    });
    const hash = (await execFileAsync(input.root, ["rev-parse", "HEAD"])).trim();
    return {
        hash,
        message: input.message,
        timestamp: new Date(input.timestamp.getTime()),
    };
}
//# sourceMappingURL=repository-fixture-writes.js.map