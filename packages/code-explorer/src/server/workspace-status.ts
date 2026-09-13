import { execFileSync } from "node:child_process";
import type { ProjectRoot } from "../semantic/api/public-api.js";
import type { ServerRuntime } from "./server-runtime.js";

function emptyWorkspaceStatus(): Record<string, unknown> {
  return { changed_paths: [], untracked_paths: [], active_exclusions: [] };
}

function hasSafeRelativePath(candidate: string): boolean {
  return (
    Boolean(candidate) &&
    !candidate.startsWith("/") &&
    !/^[A-Za-z]:\//u.test(candidate) &&
    !candidate.split("/").includes("..")
  );
}

function parseWorkspaceLine(
  line: string,
):
  | { path: string; state: "untracked" }
  | { path: string; state: "modified" | "deleted" }
  | undefined {
  const status = line.slice(0, 2);
  const candidate = line.slice(3).replaceAll("\\", "/");
  if (!hasSafeRelativePath(candidate)) return;
  if (!/\.(?:rs|py|cs|ts|tsx|js|jsx|json)$/iu.test(candidate)) return;
  if (status === "??") return { path: candidate, state: "untracked" };
  return {
    path: candidate,
    state: status.includes("D") ? "deleted" : "modified",
  };
}

function parseWorkspaceStatus(output: string): Record<string, unknown> {
  const changed_paths: Array<{
    path: string;
    state: "modified" | "deleted";
  }> = [];
  const untracked_paths: Array<{ path: string; state: "untracked" }> = [];
  for (const line of output.split(/\r?\n/u)) {
    const entry = parseWorkspaceLine(line);
    if (!entry) continue;
    if (entry.state === "untracked") {
      untracked_paths.push(entry);
      continue;
    }
    changed_paths.push(entry);
  }
  return {
    changed_paths,
    untracked_paths,
    active_exclusions: ["dist/**", "target/**", "bin/**", "obj/**", ".venv/**"],
  };
}

function nativeWorkspaceStatus(
  root: ProjectRoot | undefined,
): Record<string, unknown> {
  if (!root) return emptyWorkspaceStatus();
  try {
    const output = execFileSync(
      "git",
      [
        "-C",
        root.canonicalPath,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return parseWorkspaceStatus(output);
  } catch {
    return emptyWorkspaceStatus();
  }
}

export function readWorkspaceStatus(
  runtime: ServerRuntime,
): Record<string, unknown> {
  return (
    runtime.options.workspace_status?.() ??
    nativeWorkspaceStatus(runtime.options.projectRoot)
  );
}
