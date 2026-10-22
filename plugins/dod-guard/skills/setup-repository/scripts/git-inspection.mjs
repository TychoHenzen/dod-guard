import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runGit(root, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
    };
  }
}

function parseRemoteLine(line) {
  const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
  return match ? { name: match[1], url: match[2], direction: match[3] } : { raw: line };
}

export async function inspectGit(root) {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout !== "true") {
    return { repository: false, hasCommits: false, branch: null, remotes: [] };
  }

  const [head, branch, remotes] = await Promise.all([
    runGit(root, ["rev-parse", "--verify", "HEAD"]),
    runGit(root, ["branch", "--show-current"]),
    runGit(root, ["remote", "-v"]),
  ]);

  return {
    repository: true,
    hasCommits: head.ok,
    branch: branch.stdout || null,
    remotes: remotes.stdout.split(/\r?\n/).filter(Boolean).map(parseRemoteLine),
  };
}
