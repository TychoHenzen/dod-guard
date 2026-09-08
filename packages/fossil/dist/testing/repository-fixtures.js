import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileAsync } from "./repository-fixture-process.js";
import { recordFixtureCommit, removeFixtureSource, writeFixtureSource, } from "./repository-fixture-writes.js";
export async function createTemporaryRepository() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-fixture-"));
    const git = (args) => execFileAsync(root, args);
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
/** Writes every source-tree path relative to the repository root. */
export async function writeSourceTree(repository, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        await repository.writeSourceFile(relativePath, content);
    }
}
//# sourceMappingURL=repository-fixtures.js.map