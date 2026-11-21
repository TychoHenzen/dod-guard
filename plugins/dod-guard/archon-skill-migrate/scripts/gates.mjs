// The gates around the blind writer: the leak scan of its inputs before it
// runs, and the merge, overlap, regression and finish checks on its body
// after. The original is read out of git at the pinned commit and never
// written back.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { scoreOverlap } from "../../skills/blind-rewrite/scripts/overlap-metrics.mjs";
import { MAX_BUFFER, read, readJson } from "./files.mjs";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

// A gate that ran and said no; the CLI exits 1 on it rather than 2.
export class GateFailure extends Error {}

function original(repo, commit, target) {
  return execFileSync("git", ["cat-file", "blob", `${commit}:${target}`], { cwd: repo, maxBuffer: MAX_BUFFER });
}

// The original's frontmatter, then the writer's body without any frontmatter
// of its own.
export function merge({ dir, repo, target, commit }) {
  const source = original(repo, commit, target).toString("utf8");
  const match = FRONTMATTER.exec(source);
  const head = match ? match[0] : "";
  const body = read(join(dir, "body.md"))
    .replace(FRONTMATTER, "")
    .replace(/^\s*\n/, "");
  if (body.trim() === "") {
    throw new Error("the writer left body.md empty");
  }
  const separator = head === "" ? "" : "\n";
  writeFileSync(join(dir, "migrated.md"), `${head}${separator}${body}`);
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
}

function bodyOf(text) {
  return text.replace(FRONTMATTER, "");
}

// Brings the original out of git for one check and removes it again. The
// check gets the whole file and both bodies: the merge copies the
// frontmatter back on purpose, so the overlap scan compares bodies alone,
// or any description longer than its run limit would fail every round.
function withOriginal(options, check) {
  const folder = join(options.dir, "original-gate");
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const source = original(options.repo, options.commit, options.target).toString("utf8");
  const paths = {
    folder,
    whole: join(folder, "original.md"),
    body: join(folder, "original-body.md"),
    rewriteBody: join(folder, "migrated-body.md"),
  };
  writeFileSync(paths.whole, source);
  writeFileSync(paths.body, bodyOf(source));
  writeFileSync(paths.rewriteBody, bodyOf(read(join(options.dir, "migrated.md"))));
  try {
    return check(paths);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function overlap(options, paths) {
  const result = runNode(join(options.pack, "skills", "blind-rewrite", "scripts", "overlap-scan.mjs"), [
    "--mode=prose",
    `--original=${paths.body}`,
    `--rewrite=${paths.rewriteBody}`,
    `--contract-file=${join(options.dir, "verbatim.txt")}`,
    "--require-contract",
  ]);
  writeFileSync(join(options.dir, "overlap.json"), result.stdout);
  if (result.status === 1) {
    return { verdict: "too close", feedback: "too close" };
  }
  if (result.status !== 0) {
    throw new Error(`overlap-scan.mjs exited ${result.status}: ${result.stderr}`);
  }
  return null;
}

// The files the blind writer reads come from sessions that read the
// original. A writer that copies their phrasing copies the original second
// hand, so each one is scored against the original before any writer runs,
// with the Verbatim items exempt.
export const WRITER_INPUTS = ["inventory.md", "contract.md", "classification.md"];
// ASSUMPTION: the prose run and n-gram limits of blind-rewrite's
// overlap-metrics.mjs, which does not export them. Only these two measure
// copied wording; its order and sentence scores compare a rewrite with the
// text it replaces, and a short note scores high on order against anything.
const LEAK_LIMITS = { run: 15, ngram: 0.2 };

function leakScore(paths, dir, file) {
  const exempt = read(join(dir, "verbatim.txt"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const score = scoreOverlap(read(paths.body), read(join(dir, file)), { mode: "prose", contract: exempt });
  return score.run > LEAK_LIMITS.run || score.ngram > LEAK_LIMITS.ngram ? score : null;
}

function leakLine({ file, score }) {
  return (
    `- ${file}: its longest run of words shared with the original is ${score.run}, ` +
    `and ${Math.round(score.ngram * 100)}% of its word sequences match.`
  );
}

// Prints PASS, or the leaking files joined by commas after writing
// leak.md, which says why for each. With strict, a leak is a GateFailure.
export function leak(options) {
  const { dir } = options;
  for (const file of [...WRITER_INPUTS, "verbatim.txt"]) {
    if (!existsSync(join(dir, file))) {
      throw new Error(`${file} was not written`);
    }
  }
  const leaks = withOriginal(options, (paths) =>
    WRITER_INPUTS.map((file) => ({ file, score: leakScore(paths, dir, file) })).filter(({ score }) => score),
  );
  const feedback = join(dir, "leak.md");
  if (leaks.length === 0) {
    rmSync(feedback, { force: true });
    return "PASS";
  }
  const lines = leaks.map(leakLine);
  writeFileSync(feedback, `${lines.join("\n")}\n`);
  if (options.strict === "true") {
    throw new GateFailure(`still too close to the original after rewording:\n${lines.join("\n")}`);
  }
  return leaks.map(({ file }) => file).join(",");
}

function regression(options) {
  const { kind } = readJson(join(options.dir, "baseline.json"));
  const result = runNode(join(options.pack, "skills", "skill-migrate", "scripts", "migration-check.mjs"), [
    join(options.dir, "migrated.md"),
    `--before=${join(options.dir, "baseline.json")}`,
    `--kind=${kind}`,
  ]);
  writeFileSync(join(options.dir, "comparison.txt"), result.stdout);
  if (result.status === 1) {
    return {
      verdict: "regression",
      feedback: `migration-check reports a check that passed before now fails:\n${result.stdout}`,
    };
  }
  if (result.status !== 0) {
    throw new Error(`migration-check.mjs exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return null;
}

// The exact text as the maintainer approved it: each replaced Verbatim item
// becomes its new text in the Verbatim list and wherever it appears in the
// original, so finish-check requires the new text, a fenced block around it
// included, and no longer the old. The overlap scan keeps the true original.
// ASSUMPTION: a replaced item is replaced at every occurrence, even inside a
// longer string; that can only demand more of the rewrite, never excuse it.
function approvedExactText(options, paths) {
  const approvalsFile = join(options.dir, "approvals.json");
  const approvals = existsSync(approvalsFile) ? readJson(approvalsFile) : {};
  const replacements = Array.isArray(approvals.replacements) ? approvals.replacements : [];
  const verbatimFile = join(options.dir, "verbatim.txt");
  if (replacements.length === 0) {
    return { original: paths.whole, verbatim: verbatimFile };
  }
  const apply = (text) =>
    replacements.reduce((out, { text: from, becomes }) => out.replaceAll(from, () => becomes), text);
  const corrected = {
    original: join(paths.folder, "original-approved.md"),
    verbatim: join(paths.folder, "verbatim-approved.txt"),
  };
  writeFileSync(corrected.original, apply(read(paths.whole)));
  writeFileSync(corrected.verbatim, apply(read(verbatimFile)));
  return corrected;
}

function finishCheck(options, paths) {
  const exact = approvedExactText(options, paths);
  const result = runNode(join(options.pack, "skills", "skill-migrate", "scripts", "finish-check.mjs"), [
    `--original=${exact.original}`,
    `--rewrite=${join(options.dir, "migrated.md")}`,
    `--contract=${join(options.dir, "contract.md")}`,
    `--verbatim=${exact.verbatim}`,
    `--approvals=${join(options.dir, "approvals.json")}`,
    `--audit=${join(options.dir, "audit.md")}`,
  ]);
  writeFileSync(join(options.dir, "finish.json"), result.stdout);
  if (result.status === 0) {
    return null;
  }
  if (result.status === 1) {
    return { verdict: "unfinished", feedback: `finish-check reports missing or dropped items:\n${result.stdout}` };
  }
  throw new Error(`finish-check.mjs exited ${result.status}: ${result.stderr}`);
}

// A failed round throws its body away; the next writer starts from the
// contract and the one line of feedback alone.
export function gate(options) {
  merge(options);
  const failure = withOriginal(options, (paths) => overlap(options, paths)) ?? regression(options);
  const feedback = join(options.dir, "feedback.md");
  if (!failure) {
    rmSync(feedback, { force: true });
    return "PASS";
  }
  writeFileSync(feedback, `${failure.feedback}\n`);
  rmSync(join(options.dir, "body.md"), { force: true });
  rmSync(join(options.dir, "migrated.md"), { force: true });
  return failure.verdict;
}

export function final(options) {
  merge(options);
  const failure =
    withOriginal(options, (paths) => overlap(options, paths) ?? finishCheck(options, paths)) ?? regression(options);
  if (failure) {
    throw new GateFailure(failure.feedback);
  }
  return "PASS";
}
