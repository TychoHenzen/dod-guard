// Citation checks shared by the report-only workflows (wiring-audit and
// usability-review). A citation is { path, line?, end?, anchor? }: a file in
// the checkout, an optional line or line range inside it, and an optional
// heading, symbol, route, command or key that must appear in it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function insideRepo(path) {
  return typeof path === "string" && path !== "" && !isAbsolute(path) && !normalize(path).startsWith("..");
}

// Returns a problem sentence, or null when the citation holds.
export function citationProblem(repo, cite) {
  if (!cite || typeof cite !== "object") {
    return "a citation must be an object with a path";
  }
  const { path, line, end, anchor } = cite;
  if (!insideRepo(path)) {
    return `citation path '${path}' is not a repository-relative path`;
  }
  const full = join(repo, path);
  if (!existsSync(full)) {
    return `cited file ${path} does not exist`;
  }
  if (statSync(full).isDirectory()) {
    return line === undefined && anchor === undefined ? null : `${path} is a directory, so it has no lines`;
  }
  const lines = readFileSync(full, "utf8").split("\n");
  for (const [name, value] of [
    ["line", line],
    ["end", end],
  ]) {
    if (value === undefined) {
      continue;
    }
    if (!Number.isInteger(value) || value < 1 || value > lines.length) {
      return `${path} has ${lines.length} lines, so ${name} ${value} does not exist`;
    }
  }
  if (end !== undefined && (line === undefined || end < line)) {
    return `${path}: a range needs line <= end`;
  }
  if (anchor !== undefined) {
    if (typeof anchor !== "string" || anchor.trim() === "") {
      return `${path}: an anchor must be non-empty text`;
    }
    const span = line === undefined ? lines : lines.slice(line - 1, end ?? line);
    if (!span.join("\n").includes(anchor)) {
      const where = line === undefined ? "" : ` at line ${line}${end ? `-${end}` : ""}`;
      return `${path}${where} does not contain '${anchor}'`;
    }
  }
  return null;
}

export function formatCitation({ path, line, end, anchor }) {
  const at = line === undefined ? "" : `:${line}${end === undefined ? "" : `-${end}`}`;
  return anchor === undefined ? `${path}${at}` : `${path}${at} (${anchor})`;
}

// Tracked and untracked-but-not-ignored files under the given paths that
// contain the text.
export function filesContaining(repo, text, paths) {
  const result = spawnSync("git", ["grep", "-l", "-F", "--untracked", "-e", text, "--", ...paths], {
    cwd: repo,
    encoding: "utf8",
  });
  if (result.status === 1) {
    return [];
  }
  if (result.status !== 0) {
    throw new Error(`git grep failed: ${result.stderr}`);
  }
  return result.stdout.split("\n").filter(Boolean);
}

export function nonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function textList(value) {
  return Array.isArray(value) && value.every(nonEmptyText);
}

// A field written as a sentence, for use inside a rendered line.
export function clause(text) {
  return text.trim().replace(/[.;:,\s]+$/, "");
}
