import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import * as path from "node:path";

export function materializeTree(
  root: string,
  ref: string,
  target: string,
): void {
  if (ref === "index") {
    execFileSync(
      "git",
      ["checkout-index", "--all", `--prefix=${target}${path.sep}`],
      { cwd: root, stdio: "ignore" },
    );
    return;
  }
  const indexPath = path.join(target, "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  execFileSync("git", ["read-tree", ref], { cwd: root, env, stdio: "ignore" });
  execFileSync(
    "git",
    ["checkout-index", "--all", `--prefix=${target}${path.sep}`],
    { cwd: root, env, stdio: "ignore" },
  );
  rmSync(indexPath, { force: true });
}
