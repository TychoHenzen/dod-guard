import { execFileSync } from "node:child_process";
import type { ProjectRoot } from "../semantic/api/public-api.js";

export function nativeWorkspaceStatus(root: ProjectRoot | undefined): Record<string, unknown> {
  if (!root) return { changed_paths: [], untracked_paths: [], active_exclusions: [] };
  try {
    const output = execFileSync("git", ["-C", root.canonicalPath, "status", "--porcelain=v1", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const changed_paths: Array<{ path: string; state: "modified" | "deleted" }> = [];
    const untracked_paths: Array<{ path: string; state: "untracked" }> = [];
    for (const line of output.split(/\r?\n/u)) {
      const status = line.slice(0, 2);
      const candidate = line.slice(3).replaceAll("\\", "/");
      if (!candidate || candidate.startsWith("/") || /^[A-Za-z]:\//u.test(candidate) || candidate.split("/").includes("..")) continue;
      if (!/\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate)) continue;
      if (status === "??") untracked_paths.push({ path: candidate, state: "untracked" });
      else changed_paths.push({ path: candidate, state: status.includes("D") ? "deleted" : "modified" });
    }
    return { changed_paths, untracked_paths, active_exclusions: ["dist/**", "target/**", "bin/**", "obj/**", ".venv/**"] };
  } catch {
    return { changed_paths: [], untracked_paths: [], active_exclusions: [] };
  }
}
