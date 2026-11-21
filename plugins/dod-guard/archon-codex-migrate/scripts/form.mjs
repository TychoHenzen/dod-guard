// The approval form: validate the slices a proposal session wrote to
// slices.json, keep the valid ones in items.json, and build the choices.
import { join } from "node:path";
import { atOrUnder, GENERATED, list, readJson, writeJson } from "./common.mjs";

const ID = /^[a-z0-9][a-z0-9-]*$/;
export const NONE = "none";
export const KINDS = new Set(["reword", "move", "reduce-claude", "agents"]);

function relative(path) {
  return path !== "" && !path.startsWith("/") && !path.includes("..") && !path.includes("\\");
}

function slicePaths(slice) {
  return [...list(slice.files), ...list(slice.from), ...list(slice.to)];
}

function idProblem(slice, seen) {
  return !ID.test(String(slice.id)) || slice.id === NONE || seen.has(slice.id)
    ? `bad or repeated id ${JSON.stringify(slice.id)}`
    : null;
}

function kindProblem(slice) {
  return KINDS.has(slice.kind) ? null : `kind ${JSON.stringify(slice.kind)} is not one of ${[...KINDS].join(", ")}`;
}

function pathProblem(slice) {
  const paths = slicePaths(slice);
  if (!paths.every(relative)) {
    return "every path must be repository-relative with forward slashes";
  }
  if (paths.some((path) => atOrUnder(path, GENERATED))) {
    return "generated agent TOML is never edited by hand; use an agents slice";
  }
  return null;
}

function moveProblem(slice) {
  const moves = slice.kind === "move" || slice.kind === "reduce-claude";
  return moves && (list(slice.from).length === 0 || list(slice.to).length === 0)
    ? "a move names its source (from) and destination (to)"
    : null;
}

function emptyProblem(slice) {
  return slice.kind !== "agents" && slicePaths(slice).length === 0 ? "names no file to change" : null;
}

// In order; the first check that finds a problem names it.
const CHECKS = [idProblem, kindProblem, pathProblem, moveProblem, emptyProblem];

function sliceProblem(slice, seen) {
  for (const check of CHECKS) {
    const problem = check(slice, seen);
    if (problem) {
      return problem;
    }
  }
  return null;
}

function normalize(slice) {
  return {
    id: slice.id,
    label: String(slice.label ?? slice.id),
    kind: slice.kind,
    files: [...new Set(slicePaths(slice))],
    from: list(slice.from),
    to: list(slice.to),
    signals: list(slice.signals),
    plan: String(slice.plan ?? ""),
  };
}

function choice(slice) {
  return {
    id: slice.id,
    label: slice.label,
    does: `${slice.kind}: ${slice.files.join(", ") || "regenerate .codex/agents"}`,
  };
}

function block(slice) {
  const files = slice.files.join(", ") || "-";
  return `${slice.id}: ${slice.label} (${slice.kind})\n  files: ${files}\n  plan: ${slice.plan}`;
}

export function options({ dir }) {
  const raw = readJson(join(dir, "slices.json"));
  const seen = new Set();
  const slices = [];
  const rejected = [];
  for (const slice of Array.isArray(raw.slices) ? raw.slices : []) {
    const problem = sliceProblem(slice, seen);
    seen.add(slice.id);
    if (problem) {
      rejected.push({ id: String(slice.id), label: String(slice.label ?? ""), problem });
    } else {
      slices.push(normalize(slice));
    }
  }
  const agentSource = String(raw.agentSource ?? "");
  writeJson(join(dir, "items.json"), { slices, rejected, test: String(raw.test ?? "").trim(), agentSource });
  const choices = slices.map(choice);
  choices.push({ id: NONE, label: "Apply nothing", does: "end the run with no change" });
  const intro =
    "Pick the slices to apply; they run back to back in this order. " +
    `The proposal is in ${join(dir, "proposal.md")}.`;
  return { options: choices, count: String(slices.length), message: [intro, ...slices.map(block)].join("\n\n") };
}
