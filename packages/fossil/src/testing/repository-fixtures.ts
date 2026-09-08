import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RecordedCommit } from "./types/recorded-commit.js";
import type { TemporaryRepository } from "./types/temporary-repository.js";
import { execFileAsync } from "./repository-fixture-process.js";
import {
  recordFixtureCommit,
  removeFixtureSource,
  writeFixtureSource,
} from "./repository-fixture-writes.js";

/** Creates an isolated Git repository without host configuration. */
type TemporaryRepo = TemporaryRepository;

export async function createTemporaryRepository(): Promise<TemporaryRepo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fossil-fixture-"));
  const git = (args: readonly string[]) => execFileAsync(root, args);
  await git(["init", "--quiet"]);
  await git(["config", "user.name", "Fossil Fixture"]);
  await git(["config", "user.email", "fossil-fixture@example.invalid"]);

  return {
    root,
    git,
    writeSourceFile: (relativePath, content) =>
      writeFixtureSource(root, relativePath, content),
    removeSourcePath: (relativePath) => removeFixtureSource(root, relativePath),
    recordCommit: (message, timestamp) =>
      recordFixtureCommit({ root, message, timestamp }),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

/** Writes every source-tree path relative to the repository root. */
export async function writeSourceTree(
  repository: TemporaryRepository,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await repository.writeSourceFile(relativePath, content);
  }
}
