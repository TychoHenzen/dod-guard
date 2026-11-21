// The steps before any writer runs: the contract's Verbatim items, and the
// approval form that turns the classification's SCAFFOLDING into cuts.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { read, readJson, writeJson } from "./files.mjs";

const ID = /^[a-z0-9][a-z0-9-]*$/;
export const NONE = "none";

// ---------------------------------------------------------------- contract

// One item per line, leading "- " removed, as the skill's phase 1 says.
export function verbatim({ dir }) {
  const lines = read(join(dir, "contract.md")).split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+Verbatim\b/.test(line));
  if (start < 0) {
    throw new Error("contract.md has no ### Verbatim section");
  }
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line)) {
      break;
    }
    if (line.startsWith("- ")) {
      items.push(line.slice(2));
    }
  }
  writeFileSync(join(dir, "verbatim.txt"), items.length > 0 ? `${items.join("\n")}\n` : "");
  return String(items.length);
}

// ---------------------------------------------------------------- the form

function cutProblem(cut, seen) {
  if (!ID.test(String(cut.id)) || cut.id === NONE || seen.has(cut.id)) {
    return `bad or repeated id ${JSON.stringify(cut.id)}`;
  }
  if (cut.kind !== "text" && cut.kind !== "claim") {
    return 'kind is neither "text" nor "claim"';
  }
  for (const field of ["value", "keep", "cut"]) {
    if (typeof cut[field] !== "string" || cut[field].trim() === "") {
      return `names no ${field}`;
    }
  }
  return null;
}

export function options({ dir }) {
  const raw = readJson(join(dir, "cuts.json"));
  const seen = new Set();
  const cuts = [];
  const rejected = [];
  for (const cut of Array.isArray(raw.cuts) ? raw.cuts : []) {
    const problem = cutProblem(cut, seen);
    seen.add(cut.id);
    const entry = {
      id: String(cut.id),
      kind: cut.kind,
      value: String(cut.value ?? ""),
      keep: String(cut.keep ?? ""),
      cut: String(cut.cut ?? ""),
    };
    if (problem) {
      rejected.push({ ...entry, problem });
    } else {
      cuts.push(entry);
    }
  }
  writeJson(join(dir, "items.json"), { cuts, rejected });
  const choices = cuts.map((cut) => ({
    id: cut.id,
    label: `Cut: ${cut.value.length > 80 ? `${cut.value.slice(0, 77)}...` : cut.value}`,
    does: cut.cut,
  }));
  choices.push({ id: NONE, label: "Cut nothing", does: "keep every SCAFFOLDING item" });
  const intro = [
    "Pick the SCAFFOLDING to cut; everything not picked is kept.",
    `REQUIRED and OBSERVED claims are in ${join(dir, "contract.md")}; ` +
      `every tagged item is in ${join(dir, "classification.md")}.`,
    "Use the answer text for anything else: a missed requirement, a REQUIRED claim that is wrong, " +
      "or an edit to exact text. The text is also recorded as the reason for each cut.",
  ].join("\n");
  const blocks = cuts.map((cut) => `${cut.id} (${cut.kind}): ${cut.value}\n  kept: ${cut.keep}\n  cut: ${cut.cut}`);
  const notes = rejected.map((entry) => `${entry.id}: not offered, ${entry.problem}; it is kept`);
  return { options: choices, count: String(cuts.length), message: [intro, ...blocks, ...notes].join("\n\n") };
}

// Every cut carries the maintainer's words as its reason, as phase 3 asks.
export function approve({ dir, answer }) {
  const { cuts } = readJson(join(dir, "items.json"));
  const parsed = JSON.parse(answer) ?? {};
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const reason = text === "" ? "picked on the skill-migrate form" : text;
  const approvedCuts = cuts
    .filter((cut) => picked.has(cut.id))
    .map((cut) => (cut.kind === "text" ? { text: cut.value, reason } : { claim: cut.value, reason }));
  writeJson(join(dir, "approvals.json"), { approvedCuts });
  writeFileSync(join(dir, "corrections.md"), text === "" ? "The maintainer gave no corrections.\n" : `${text}\n`);
  return { count: String(approvedCuts.length) };
}
