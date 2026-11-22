// Dating each CONFLICT and DUPLICATE pair and turning it into an edit for the
// apply session, or an undecided entry when the dating cannot settle it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { claimOf, readJson, statePath, where, writeJson } from "./claims.mjs";

const DATED = new Set(["CONFLICT", "DUPLICATE"]);
const CR = /\r/g;
const DESCRIPTION = /"description"\s*:\s*("(?:[^"\\]|\\.)*")/;
const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;

export function globToRegExp(glob) {
  const source = glob
    .split("**")
    .map((part) => part.replace(GLOB_SPECIAL, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

function matcher(globs) {
  const patterns = String(globs ?? "")
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean)
    .map(globToRegExp);
  return (file) => patterns.some((pattern) => pattern.test(file));
}

// What is on disk now where the scanner saw the claim. For a manifest the
// claim is the description string on its line.
export function textAt(repo, claim) {
  const path = join(repo, claim.file);
  if (!existsSync(path)) {
    return null;
  }
  const lines = readFileSync(path, "utf8").replace(CR, "").split("\n");
  if (claim.file.endsWith(".json")) {
    const match = DESCRIPTION.exec(lines[claim.startLine - 1] ?? "");
    return match ? JSON.parse(match[1]) : null;
  }
  return lines.slice(claim.startLine - 1, claim.endLine).join("\n");
}

function dateSides(options, a, b) {
  const args = [options.claimAge, `--pair=${where(a)}`, `--pair=${where(b)}`, `--min-gap=${options.minGap}`, "--json"];
  const result = spawnSync(process.execPath, args, { cwd: options.repo, encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`claim-age failed on ${where(a)} and ${where(b)}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function sideDates(dating) {
  return { a: dating.a.date, b: dating.b.date };
}

function undecidedEntry(pair, reason, detail, dates = null) {
  return { id: pair.id, reason, detail, a: claimOf(pair.a), b: claimOf(pair.b), dates };
}

function action(pair, verdict, dating) {
  const olderIsA = dating.olderSide === "a";
  const older = olderIsA ? pair.a : pair.b;
  const newer = olderIsA ? pair.b : pair.a;
  return {
    id: pair.id,
    verdict: verdict.verdict,
    kind: verdict.verdict === "CONFLICT" ? "delete" : "point",
    target: claimOf(older),
    survivor: claimOf(newer),
    evidence: [verdict.evidenceA, verdict.evidenceB].filter(Boolean),
    why: verdict.why,
    settledBy: olderIsA ? dating.a : dating.b,
    reason: dating.reason,
  };
}

function decide(options, pair, verdict) {
  if (options.isGenerated(pair.a.file) || options.isGenerated(pair.b.file)) {
    return undecidedEntry(pair, "generated source", "a declared generator reads one of the files");
  }
  for (const side of [pair.a, pair.b]) {
    if (textAt(options.repo, side) !== side.text) {
      return undecidedEntry(pair, "range changed", `${where(side)} no longer holds the scanned text`);
    }
  }
  const dating = dateSides(options, pair.a, pair.b);
  if (dating.verdict !== "DECISIVE") {
    return undecidedEntry(pair, "ambiguous dating", dating.reason, sideDates(dating));
  }
  return action(pair, verdict, dating);
}

function overlaps(left, right) {
  return left.file === right.file && left.startLine <= right.endLine && right.startLine <= left.endLine;
}

// One claim can sit in several pairs. Only the first action on a range may
// edit it, and no action may point at a claim another action removes.
function dropCollisions(actions, pairsById) {
  const kept = [];
  const dropped = [];
  for (const candidate of actions) {
    const clash =
      kept.some((other) => overlaps(other.target, candidate.target)) ||
      actions.some((other) => other !== candidate && overlaps(other.target, candidate.survivor));
    if (clash) {
      dropped.push(undecidedEntry(pairsById.get(candidate.id), "range changed", "another action edits the same claim"));
    } else {
      kept.push(candidate);
    }
  }
  return { kept, dropped };
}

export function plan(options) {
  const state = readJson(statePath(options.dir));
  const pairsById = new Map(state.pairs.map((pair) => [pair.id, pair]));
  const isGenerated = matcher(options.generated);
  const settings = { ...options, isGenerated, minGap: options.minGap ?? 1 };
  const undecided = Object.entries(state.undecided).map(([id, entry]) =>
    undecidedEntry(pairsById.get(id), entry.reason, entry.detail),
  );
  const actions = [];
  for (const pair of state.pairs) {
    const verdict = state.verdicts[pair.id];
    if (!verdict || !DATED.has(verdict.verdict)) {
      continue;
    }
    const outcome = decide(settings, pair, verdict);
    (outcome.kind ? actions : undecided).push(outcome);
  }
  const { kept, dropped } = dropCollisions(actions, pairsById);
  const judged = Object.keys(state.verdicts).length;
  writeJson(join(options.dir, "plan.json"), {
    scan: state.scan,
    pairCount: state.pairs.length,
    judged,
    verdicts: state.verdicts,
    actions: kept,
    undecided: [...undecided, ...dropped],
  });
  return kept.length;
}
