// The gates that keep the port and deletion sessions to what was approved:
// each reads the working tree's changes against HEAD and reverts the ones the
// approval does not cover, logging every revert to reverted.json.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { git, readJson, readJsonOr, writeJson } from "./io.mjs";

// Files a package manager rewrites when it removes a dependency.
export const MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "requirements.txt",
  "go.mod",
  "go.sum",
  "Gemfile",
  "Gemfile.lock",
]);

function baseName(path) {
  return path.split("/").pop();
}

// One entry per changed path in the working tree and index, against HEAD.
export function changes(repo) {
  const out = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const entries = [];
  const fields = out.split("\0").filter(Boolean);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const code = field.slice(0, 2);
    const path = field.slice(3);
    if (code[0] === "R" || code[0] === "C") {
      index += 1;
      entries.push({ kind: "renamed", path, from: fields[index] });
    } else if (code === "??") {
      entries.push({ kind: "added", path });
    } else if (code.includes("D")) {
      entries.push({ kind: "deleted", path });
    } else {
      entries.push({ kind: "modified", path });
    }
  }
  return entries;
}

function restore(repo, entry) {
  if (entry.kind === "added") {
    rmSync(join(repo, entry.path), { force: true });
    return;
  }
  if (entry.kind === "renamed") {
    git(repo, ["rm", "-q", "--cached", "--", entry.path]);
    rmSync(join(repo, entry.path), { force: true });
    git(repo, ["checkout", "HEAD", "--", entry.from]);
    return;
  }
  git(repo, ["checkout", "HEAD", "--", entry.path]);
}

// Reverts every change `refusal` gives a reason for, and returns the reverts.
function enforce(repo, refusal) {
  const reverted = [];
  for (const entry of changes(repo)) {
    const reason = refusal(entry);
    if (reason !== null) {
      restore(repo, entry);
      reverted.push({ path: entry.path, kind: entry.kind, reason });
    }
  }
  return reverted;
}

function approvedItems(dir) {
  return readJson(join(dir, "approved.json")).approved;
}

function appendLog(dir, name, entries) {
  const path = join(dir, `${name}.json`);
  writeJson(path, [...readJsonOr(path, []), ...entries]);
}

// Ports change the surviving side: they delete nothing and leave the dying
// files as they are, since those go in the deletion commit.
export function ports({ dir, repo }) {
  const dying = new Set(approvedItems(dir).flatMap((item) => item.delete));
  const reverted = enforce(repo, (entry) => {
    if (entry.kind === "deleted" || entry.kind === "renamed") {
      return "a port deletes or renames nothing";
    }
    return dying.has(entry.path) ? "a port leaves the dying files alone" : null;
  });
  appendLog(dir, "reverted", reverted);
  return reverted;
}

export function gate({ dir, repo }) {
  const items = approvedItems(dir);
  const dying = new Set(items.flatMap((item) => item.delete));
  const edits = new Set(items.flatMap((item) => item.edits));
  const dependencies = items.some((item) => item.dependencies.length > 0);
  const reverted = enforce(repo, (entry) => {
    if (entry.kind === "deleted") {
      return dying.has(entry.path) ? null : "the approval did not name this file";
    }
    if (entry.kind === "modified") {
      if (edits.has(entry.path)) {
        return null;
      }
      const manifest = dependencies && MANIFESTS.has(baseName(entry.path));
      return manifest ? null : "the approval named no edit to this file";
    }
    return "a deletion adds or renames nothing";
  });
  appendLog(dir, "reverted", reverted);
  return reverted;
}
