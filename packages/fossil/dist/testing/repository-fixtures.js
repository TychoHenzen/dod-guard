import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
function toGitTimestamp(timestamp) {
    return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
}
async function gitOutput(root, args) {
    const result = await execFileAsync("git", [...args], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
    });
    return result.stdout;
}
function sourceTarget(root, relativePath) {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Fixture path must stay within the repository: ${relativePath}`);
    }
    return target;
}
async function writeFixtureSource(root, relativePath, content) {
    const target = sourceTarget(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
}
async function removeFixtureSource(root, relativePath) {
    await fs.rm(sourceTarget(root, relativePath), { recursive: true, force: true });
}
async function recordFixtureCommit(input) {
    const gitTimestamp = toGitTimestamp(input.timestamp);
    await gitOutput(input.root, ["add", "--all"]);
    await execFileAsync("git", ["commit", "--quiet", "--message", input.message], {
        cwd: input.root,
        encoding: "utf8",
        windowsHide: true,
        env: {
            ...process.env,
            GIT_AUTHOR_DATE: gitTimestamp,
            GIT_COMMITTER_DATE: gitTimestamp,
        },
    });
    const hash = (await gitOutput(input.root, ["rev-parse", "HEAD"])).trim();
    return { hash, message: input.message, timestamp: new Date(input.timestamp.getTime()) };
}
/** Creates an isolated Git repository with an identity that never uses host configuration. */
export async function createTemporaryRepository() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-fixture-"));
    const git = (args) => gitOutput(root, args);
    await git(["init", "--quiet"]);
    await git(["config", "user.name", "Fossil Fixture"]);
    await git(["config", "user.email", "fossil-fixture@example.invalid"]);
    return {
        root,
        git,
        writeSourceFile: (relativePath, content) => writeFixtureSource(root, relativePath, content),
        removeSourcePath: (relativePath) => removeFixtureSource(root, relativePath),
        recordCommit: (message, timestamp) => recordFixtureCommit({ root, message, timestamp }),
        cleanup: () => fs.rm(root, { recursive: true, force: true }),
    };
}
/** Writes every path in a source tree relative to a temporary repository root. */
export async function writeSourceTree(repository, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        await repository.writeSourceFile(relativePath, content);
    }
}
//# sourceMappingURL=repository-fixtures.js.map