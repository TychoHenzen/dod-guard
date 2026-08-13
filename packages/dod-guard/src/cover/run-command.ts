/**
 * The whole-file command a bound test runs by. No `--test-name-pattern`: a
 * `verify_cmd` runs through a shell later, and `reachability.ts`'s own
 * header comment documents `shell: true` silently dropping a space-bearing
 * pattern argument on Windows.
 */
import * as path from "node:path";
import { distTestFile } from "./dist-file.js";
import { packageDirForGroup } from "./package-dir.js";

/** `node --experimental-test-module-mocks --test <dist file>`, relative to
 * `cwd` and forward-slash-joined so the command reads the same on every OS. */
export function buildTestRunCommand(cwd: string, group: string, testFile: string): string {
  const pkgDir = packageDirForGroup(group);
  const execTestFile = distTestFile(cwd, pkgDir, testFile);
  const relPath = path.relative(cwd, execTestFile).split(path.sep).join("/");
  return `node --experimental-test-module-mocks --test ${relPath}`;
}
