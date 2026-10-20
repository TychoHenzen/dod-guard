// Repo-wide content checks: JSON parseability, orphaned plugin content,
// leaked secrets, machine-specific paths, and files that would never reach a
// user because git does not track them.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { inIgnoredDir, toPosix, walkFiles } from "./fs-utils.mjs";

// Placeholder home directory names that appear in documentation on purpose.
const GENERIC_USERS = new Set(["user", "username", "you", "youruser", "name", "me", "example", "runner", "home"]);
const WINDOWS_HOME = /[A-Za-z]:\\Users\\([A-Za-z][\w.-]*)/;
const UNIX_HOME = /\/(?:home|Users)\/([a-z][\w.-]*)/;
const SECRET_ASSIGNMENT = /(password|passwd|secret|token|api[-_]?key|access[-_]?key)\s*[:=]\s*["']([^"'\n]{4,})["']/i;
// Values that are obviously stand-ins rather than real credentials.
const PLACEHOLDER_VALUE = /^(\$|<|\{|your|example|changeme|redacted|placeholder|dummy|fake|test|x{3,}|\*{3,}|\.\.\.)/i;

// Every tree that reaches a user: npm workspaces, standalone plugins, and the
// root marketplace manifest.
const CONTENT_ROOTS = ["packages", "plugins", ".claude-plugin"];

/**
 * Every file a clean checkout would hold: tracked files plus untracked files git
 * does not ignore (so a new file is checked before its first commit). Ignored
 * build output and leftover directories are not counted, which keeps a local run
 * comparable with CI. Returns absolute paths, or null after reporting why git
 * could not list them.
 */
export function listCheckedFiles(root, report) {
  let listing;
  try {
    listing = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    report(root, `cannot list git files: ${err.message}`);
    return null;
  }
  return [...new Set(listing.split("\0").filter(Boolean))]
    .map((relativePath) => join(root, relativePath))
    .filter((file) => existsSync(file) && !inIgnoredDir(root, file));
}

function underContentRoot(root, file) {
  const relativePath = toPosix(root, file);
  return CONTENT_ROOTS.some((dir) => relativePath.startsWith(`${dir}/`));
}

function shippedTextFiles(root, files) {
  return files
    .filter((file) => underContentRoot(root, file))
    .filter((file) => file.endsWith(".md") || file.endsWith(".json"))
    .filter((file) => basename(file) !== "package-lock.json");
}

/** A JSON file that does not parse breaks whatever reads it, often silently. */
export function checkJsonSyntax(root, report, files) {
  const candidates = files.filter(
    (file) => file.endsWith(".json") && (underContentRoot(root, file) || !toPosix(root, file).includes("/")),
  );
  let checked = 0;
  for (const file of candidates) {
    checked += 1;
    try {
      JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      report(file, `not valid JSON: ${err.message}`);
    }
  }
  return checked;
}

/**
 * skills/ or agents/ next to no plugin.json means the content ships nowhere:
 * Claude Code only loads them relative to a plugin manifest.
 */
export function checkOrphanPluginContent(root, report, files) {
  const parents = new Set();
  for (const file of files.filter((f) => toPosix(root, f).startsWith("packages/"))) {
    const rel = toPosix(root, file);
    // Non-greedy: the first skills/ or agents/ segment is the plugin root, so a
    // nested agents/ directory inside a skill does not look like its own plugin.
    const match = /^(.*?)\/(skills|agents)\//.exec(rel);
    if (match) parents.add(match[1]);
  }
  for (const parent of parents) {
    const manifest = join(root, parent, ".claude-plugin", "plugin.json");
    if (!existsSync(manifest))
      report(
        join(root, parent),
        "holds skills/ or agents/ but no .claude-plugin/plugin.json - that content loads nowhere",
      );
  }
}

function scanLine(line) {
  const home = WINDOWS_HOME.exec(line) ?? UNIX_HOME.exec(line);
  if (home && !GENERIC_USERS.has(home[1].toLowerCase())) {
    return `machine-specific path "${home[0]}" - use a placeholder or an environment variable`;
  }
  const secret = SECRET_ASSIGNMENT.exec(line);
  if (secret && !PLACEHOLDER_VALUE.test(secret[2])) {
    return `possible hardcoded credential: ${secret[1]} = "${secret[2].slice(0, 12)}..."`;
  }
  return null;
}

/** Shipped markdown and JSON must carry no credentials and no developer's home path. */
export function checkShippedContent(root, report, files) {
  const textFiles = shippedTextFiles(root, files);
  for (const file of textFiles) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const problem = scanLine(line);
      if (problem) report(file, `line ${index + 1}: ${problem}`);
    }
  }
  return textFiles.length;
}

/**
 * Builds a predicate that answers "does git track this absolute path" -
 * shared by checkGitTracked and the plugin-checks bundle/hook-target rules
 * so `git ls-files` runs once instead of once per caller.
 */
export function createTrackedPredicate(root, report) {
  let tracked;
  try {
    tracked = new Set(
      execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean),
    );
  } catch (err) {
    report(root, `cannot list git-tracked files: ${err.message}`);
    return null;
  }
  return (file) => tracked.has(toPosix(root, file));
}

/**
 * The marketplace installs plugins by checking out this repo, so an untracked
 * or gitignored skill exists locally and nowhere else.
 */
export function checkGitTracked(plugins, report, isTracked) {
  if (!isTracked) return;
  for (const pkg of plugins) {
    const shipped = ["skills", "agents", "output-styles", ".claude-plugin"].flatMap((dir) =>
      walkFiles(join(pkg.dir, dir)),
    );
    shipped.push(join(pkg.dir, ".mcp.json"));
    for (const file of shipped.filter((f) => existsSync(f))) {
      if (!isTracked(file))
        report(file, "not tracked by git - /plugin installs from the repo, so this file would not ship");
    }
  }
}
