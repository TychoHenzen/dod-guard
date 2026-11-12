// biome-ignore lint/correctness/noNodejsModules: test fixture drives a real git repository
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: test fixture writes files to a temp repository
import fs from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: test fixture builds temp paths
import os from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test fixture builds repository paths
import path from "node:path";

function git(root, args) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.autocrlf=false",
      "-C",
      root,
      ...args,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}
function writeAll(root, files) {
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
}
function commitFiles(root, files) {
  writeAll(root, files);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  return git(root, ["rev-parse", "HEAD"]);
}
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "carry-"));
  git(root, ["init", "-q"]);
  const head = commitFiles(root, files);
  return { root, head };
}

export { commitFiles, makeRepo };
