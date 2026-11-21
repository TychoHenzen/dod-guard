// Evidence checks shared by the report-only workflows (wiring-audit and
// usability-review). A citation is { path, line?, end?, anchor? }: a file in
// the checkout, an optional line or line range inside it, and an optional
// heading, symbol, route, command or key that must appear in it.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function insideRepo(path) {
  return typeof path === "string" && path !== "" && !isAbsolute(path) && !normalize(path).startsWith("..");
}

// The cited path's lines, "missing", or "directory". One open descriptor
// answers all three, so the file cannot change between the check and the read.
function readCited(full) {
  let fd;
  try {
    fd = openSync(full, "r");
  } catch (error) {
    if (error.code === "EISDIR") {
      return "directory";
    }
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return "missing";
    }
    throw error;
  }
  try {
    return fstatSync(fd).isDirectory() ? "directory" : readFileSync(fd, "utf8").split("\n");
  } finally {
    closeSync(fd);
  }
}

function lineProblem(path, lines, { line, end }) {
  for (const [name, value] of [
    ["line", line],
    ["end", end],
  ]) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > lines.length)) {
      return `${path} has ${lines.length} lines, so ${name} ${value} does not exist`;
    }
  }
  if (end !== undefined && (line === undefined || end < line)) {
    return `${path}: a range needs line <= end`;
  }
  return null;
}

function anchorProblem(path, lines, { line, end, anchor }) {
  if (anchor === undefined) {
    return null;
  }
  if (typeof anchor !== "string" || anchor.trim() === "") {
    return `${path}: an anchor must be non-empty text`;
  }
  const span = line === undefined ? lines : lines.slice(line - 1, end ?? line);
  if (span.join("\n").includes(anchor)) {
    return null;
  }
  const where = line === undefined ? "" : ` at line ${line}${end ? `-${end}` : ""}`;
  return `${path}${where} does not contain '${anchor}'`;
}

// Returns a problem sentence, or null when the citation holds.
export function citationProblem(repo, cite) {
  if (!cite || typeof cite !== "object") {
    return "a citation must be an object with a path";
  }
  const { path, line, anchor } = cite;
  if (!insideRepo(path)) {
    return `citation path '${path}' is not a repository-relative path`;
  }
  const lines = readCited(join(repo, path));
  if (lines === "missing") {
    return `cited file ${path} does not exist`;
  }
  if (lines === "directory") {
    return line === undefined && anchor === undefined ? null : `${path} is a directory, so it has no lines`;
  }
  return lineProblem(path, lines, cite) ?? anchorProblem(path, lines, cite);
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

function problemsIn(source, repo, validate) {
  if (!existsSync(source)) {
    return { problems: ["findings.json was not written"] };
  }
  try {
    const findings = readJson(source);
    return { findings, problems: validate(repo, findings) };
  } catch (error) {
    return { problems: [`findings.json is not valid JSON: ${error.message}`] };
  }
}

// The check step of a report-only workflow: hold the session's findings.json
// to `validate`. Prints PASS and writes report.md from `render`, or prints
// RETRY and writes feedback.md listing every problem for the next round.
export function checkFindings({ dir, repo, validate, render }) {
  const feedback = join(dir, "feedback.md");
  const { findings, problems } = problemsIn(join(dir, "findings.json"), repo, validate);
  if (problems.length > 0) {
    writeFileSync(feedback, `${problems.map((problem) => `- ${problem}`).join("\n")}\n`);
    return "RETRY";
  }
  rmSync(feedback, { force: true });
  writeFileSync(join(dir, "report.md"), render(findings));
  return "PASS";
}
