// The steps before any writer runs: the contract's Verbatim items, and the
// approval form that turns the classification's SCAFFOLDING into cuts and
// the maintainer's "replace" lines into exact-text replacements.
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

// The Verbatim items by the id the form shows them under: v1, v2, ...
function verbatimIds(dir) {
  const items = read(join(dir, "verbatim.txt"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return new Map(items.map((item, index) => [`v${index + 1}`, item]));
}

// ---------------------------------------------------------------- replacements

// The one way to edit exact text: a line of the answer text that is exactly
// "replace <id>: <new text>". Every other line is a prose correction.
const REPLACE = /^replace\s+(v\d+)\s*:(.*)$/;

function replacementLine(match, ids, seen) {
  const [, id, rest] = match;
  const becomes = rest.trim();
  if (!ids.has(id)) {
    throw new Error(`replace ${id}: no Verbatim item has that id`);
  }
  if (becomes === "") {
    throw new Error(`replace ${id}: names no new text; offer a cut to remove exact text`);
  }
  if (seen.has(id)) {
    throw new Error(`replace ${id}: given more than once`);
  }
  seen.add(id);
  return { text: ids.get(id), becomes };
}

// Splits the answer text into the replacements and the prose around them.
function splitAnswer(text, ids) {
  const seen = new Set();
  const replaced = [];
  const prose = [];
  for (const line of text.split(/\r?\n/)) {
    const match = REPLACE.exec(line.trim());
    if (match) {
      replaced.push(replacementLine(match, ids, seen));
    } else {
      prose.push(line);
    }
  }
  return { replaced, prose: prose.join("\n").trim() };
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
    "Use the answer text for a missed requirement or a REQUIRED claim that is wrong. " +
      "That text is also recorded as the reason for each cut.",
    'To edit exact text, add a line "replace <id>: <new text>" for a Verbatim item below. ' +
      "Exact text changes only that way; the gates then require the new text word for word.",
  ].join("\n");
  const exact = [...verbatimIds(dir)].map(([id, item]) => `${id}: ${item}`);
  const listed = exact.length > 0 ? [`Verbatim items:\n${exact.join("\n")}`] : [];
  const blocks = cuts.map((cut) => `${cut.id} (${cut.kind}): ${cut.value}\n  kept: ${cut.keep}\n  cut: ${cut.cut}`);
  const notes = rejected.map((entry) => `${entry.id}: not offered, ${entry.problem}; it is kept`);
  const message = [intro, ...listed, ...blocks, ...notes].join("\n\n");
  return { options: choices, count: String(cuts.length), message };
}

// Every cut and replacement carries the maintainer's prose as its reason, as
// phase 3 asks. A Verbatim item is either cut or replaced, never both.
export function approve({ dir, answer }) {
  const { cuts } = readJson(join(dir, "items.json"));
  const parsed = JSON.parse(answer) ?? {};
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const { replaced, prose } = splitAnswer(typeof parsed.text === "string" ? parsed.text : "", verbatimIds(dir));
  const picked = decisions.includes(NONE) ? new Set() : new Set(decisions);
  const reason = prose === "" ? "picked on the skill-migrate form" : prose;
  const approvedCuts = cuts
    .filter((cut) => picked.has(cut.id))
    .map((cut) => (cut.kind === "text" ? { text: cut.value, reason } : { claim: cut.value, reason }));
  const clash = replaced.find((entry) => approvedCuts.some((cut) => cut.text === entry.text));
  if (clash) {
    throw new Error(`"${clash.text}" is both cut and replaced; pick one`);
  }
  const replacements = replaced.map((entry) => ({ ...entry, reason }));
  writeJson(join(dir, "approvals.json"), { approvedCuts, replacements });
  writeFileSync(join(dir, "corrections.md"), prose === "" ? "The maintainer gave no corrections.\n" : `${prose}\n`);
  return { count: String(approvedCuts.length), replaced: String(replacements.length) };
}
