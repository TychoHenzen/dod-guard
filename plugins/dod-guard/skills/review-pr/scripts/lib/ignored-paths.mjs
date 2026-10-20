// biome-ignore lint/correctness/noNodejsModules: This skill helper runs git under Node.js.
import { spawnSync } from "node:child_process";

// Windows allows about 32000 characters on one command line; stay well below.
const ARGUMENT_BUDGET = 24_000;
const BYTES_PER_MEBIBYTE = 1024 * 1024;
const MAX_OUTPUT_MEBIBYTES = 64;

// `git ls-files -z` separates paths with NUL, so no path is quoted or split.
function parseIgnoredPaths(output) {
  return output.split("\0").filter((path) => path !== "");
}

// The checkout's own gitignored paths. A directory keeps its trailing slash.
function ignoredPaths(root) {
  const result = spawnSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: MAX_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ls-files failed (${result.status}): ${result.error?.message ?? result.stderr}`);
  }
  return parseIgnoredPaths(result.stdout);
}

function excludeArguments(paths) {
  return paths.map((path) => `--exclude=${path}`);
}

function withinBudget(args) {
  return args.join(" ").length <= ARGUMENT_BUDGET;
}

// The scan covers the whole repository, so build output the repository ignores
// must not be judged. Past the budget only directory entries are kept, because
// one directory entry stands for every file under it.
function scanArguments(root, ignored) {
  const everything = excludeArguments(ignored);
  const directories = excludeArguments(ignored.filter((path) => path.endsWith("/")));
  const excludes = [everything, directories].find(withinBudget);
  if (excludes === undefined) {
    throw new Error(
      `${ignored.length} gitignored paths do not fit on one scan command line (${directories.join(" ").length} characters of directories)`,
    );
  }
  return [".", `--root=${root}`, "--format=json", ...excludes];
}

export { ignoredPaths, parseIgnoredPaths, scanArguments };
