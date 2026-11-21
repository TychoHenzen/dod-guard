// The approval form: validate the survey's candidates.json, offer the valid
// items as a multi-select, and record which ones the answer approved.
import { join } from "node:path";
import { list, readJson, tracked, writeJson } from "./io.mjs";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const CONFIDENCE = new Set(["Strong", "Fair"]);
export const NONE = "none";

// ---------------------------------------------------------------- validation

function idProblem(item, seen) {
  if (!ID.test(String(item.id)) || item.id === NONE) {
    return `bad id ${JSON.stringify(item.id)}`;
  }
  return seen.has(item.id) ? "duplicate id" : null;
}

function confidenceProblem(item) {
  if (!CONFIDENCE.has(item.confidence)) {
    return `confidence ${JSON.stringify(item.confidence)} is not Strong or Fair; a Weak pair is never deleted`;
  }
  const gapless = item.confidence === "Fair" && String(item.gap ?? "").trim() === "";
  return gapless ? "a Fair pair must name its gap; without one it counts as Weak" : null;
}

function filesProblem(item, repo) {
  const deletes = list(item.delete);
  if (deletes.length === 0) {
    return "names no file to delete";
  }
  const untracked = [...deletes, ...list(item.edits)].filter((path) => !tracked(repo, path));
  if (untracked.length > 0) {
    return `not tracked: ${untracked.join(", ")}`;
  }
  const both = deletes.filter((path) => list(item.edits).includes(path) || list(item.keep).includes(path));
  return both.length > 0 ? `both deleted and kept or edited: ${both.join(", ")}` : null;
}

// The first reason the item cannot be offered, or null when it can. The
// checks run in order, so git is asked about files only for a well-formed item.
function itemProblem(item, repo, seen) {
  return idProblem(item, seen) ?? confidenceProblem(item) ?? filesProblem(item, repo);
}

function normalize(item) {
  return {
    id: item.id,
    label: String(item.label ?? item.id),
    confidence: item.confidence,
    gap: String(item.gap ?? ""),
    delete: list(item.delete),
    keep: list(item.keep),
    edits: list(item.edits),
    dependencies: list(item.dependencies),
    ports: list(item.ports),
    created: String(item.created ?? ""),
    references: item.references ?? null,
    evidence: String(item.evidence ?? ""),
  };
}

// ---------------------------------------------------------------- the form

function describe(item) {
  const parts = [`deletes ${item.delete.join(", ")}`];
  if (item.edits.length > 0) {
    parts.push(`updates ${item.edits.join(", ")}`);
  }
  if (item.dependencies.length > 0) {
    parts.push(`removes ${item.dependencies.join(", ")}`);
  }
  if (item.ports.length > 0) {
    parts.push(`first ports ${item.ports.length} fix(es)`);
  }
  const gap = item.confidence === "Fair" ? `; gap: ${item.gap}` : "";
  return `${item.confidence}: ${parts.join("; ")}${gap}`;
}

function itemBlock(item) {
  const lines = [`${item.id}: ${item.label} (${item.confidence})`];
  lines.push(`  delete: ${item.delete.join(", ")}`);
  lines.push(`  superseded by: ${item.keep.join(", ") || "(none named)"}`);
  if (item.created) {
    lines.push(`  created: ${item.created}`);
  }
  lines.push(`  references to update: ${item.edits.join(", ") || "none"}`);
  lines.push(`  fixes to port first: ${item.ports.join("; ") || "none"}`);
  if (item.dependencies.length > 0) {
    lines.push(`  orphaned dependencies: ${item.dependencies.join(", ")}`);
  }
  if (item.confidence === "Fair") {
    lines.push(`  gap: ${item.gap}`);
  }
  if (item.evidence) {
    lines.push(`  evidence: ${item.evidence}`);
  }
  return lines.join("\n");
}

function message(items) {
  const intro = [
    "Pick the items to delete. Each one deletes exactly the files it lists and nothing else.",
    "A partial pick binds: unpicked items stay. Pick 'Delete nothing' to end the run with no change.",
  ].join("\n");
  return [intro, ...items.map(itemBlock)].join("\n\n");
}

export function options({ dir, repo }) {
  const raw = readJson(join(dir, "candidates.json"));
  const seen = new Set();
  const items = [];
  const rejected = [];
  for (const item of Array.isArray(raw.items) ? raw.items : []) {
    const problem = itemProblem(item, repo, seen);
    seen.add(item.id);
    if (problem) {
      rejected.push({ id: String(item.id), label: String(item.label ?? ""), problem });
    } else {
      items.push(normalize(item));
    }
  }
  writeJson(join(dir, "items.json"), { items, rejected, weak: list(raw.weak), notes: String(raw.notes ?? "") });
  const choices = items.map((item) => ({ id: item.id, label: item.label, does: describe(item) }));
  choices.push({ id: NONE, label: "Delete nothing", does: "end the run with no change" });
  return { options: choices, count: String(items.length), message: message(items) };
}

export function approve({ dir, answer }) {
  const { items } = readJson(join(dir, "items.json"));
  const parsed = JSON.parse(answer);
  const decisions = list(parsed?.decisions);
  // ASSUMPTION: "Delete nothing" alongside other picks is a contradiction, so the safe reading wins.
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const approved = items.filter((item) => picked.has(item.id));
  const declined = items.filter((item) => !picked.has(item.id));
  writeJson(join(dir, "approved.json"), { approved, declined, text: String(parsed?.text ?? "") });
  return {
    count: String(approved.length),
    ports: String(approved.reduce((sum, item) => sum + item.ports.length, 0)),
  };
}

export function checks({ dir }) {
  return String(readJson(join(dir, "candidates.json")).checks ?? "").trim();
}
