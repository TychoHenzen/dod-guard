#!/usr/bin/env node
// The deterministic steps of the clean-house workflow. A survey session
// writes candidates.json; this script turns it into the approval form, keeps
// the later sessions to what was approved, and writes the report.
//
//   options --dir=<artifacts> --repo=<root>        validate candidates.json; print the form as JSON
//   approve --dir=<artifacts> --answer=<json>      record the multi-select answer; print it as JSON
//   checks  --dir=<artifacts>                      print the check command
//   ports   --dir=<artifacts> --repo=<root>        revert port edits that delete files or touch dying ones
//   gate    --dir=<artifacts> --repo=<root>        revert deletion edits the approval did not name
//   report  --dir=<artifacts> --repo=<root>        write and print report.md
//
// Exit 2 on any error.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const OPTION = /^--([\w-]+)=(.*)$/s;
const CONFIDENCE = new Set(["Strong", "Fair"]);
export const NONE = "none";
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function tracked(repo, path) {
  return spawnSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd: repo }).status === 0;
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry !== "") : [];
}

function baseName(path) {
  return path.split("/").pop();
}

// ---------------------------------------------------------------- the form

function itemProblem(item, repo, seen) {
  if (!ID.test(String(item.id)) || item.id === NONE) {
    return `bad id ${JSON.stringify(item.id)}`;
  }
  if (seen.has(item.id)) {
    return "duplicate id";
  }
  if (!CONFIDENCE.has(item.confidence)) {
    return `confidence ${JSON.stringify(item.confidence)} is not Strong or Fair; a Weak pair is never deleted`;
  }
  if (item.confidence === "Fair" && String(item.gap ?? "").trim() === "") {
    return "a Fair pair must name its gap; without one it counts as Weak";
  }
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

// ---------------------------------------------------------------- gates

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

function enforce(repo, allowed) {
  const reverted = [];
  for (const entry of changes(repo)) {
    const reason = allowed(entry);
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
  const previous = existsSync(path) ? readJson(path) : [];
  writeJson(path, [...previous, ...entries]);
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

// ---------------------------------------------------------------- report

function bullet(lines, text) {
  lines.push(`- ${text}`);
}

function deletedSection(items, repo) {
  const out = [];
  for (const item of items) {
    const gone = item.delete.filter((path) => !existsSync(join(repo, path)));
    const kept = item.delete.filter((path) => existsSync(join(repo, path)));
    if (gone.length > 0) {
      bullet(
        out,
        `${item.id} ${item.label}: deleted ${gone.join(", ")}; superseded by ${item.keep.join(", ") || "(none named)"}`,
      );
    }
    if (kept.length > 0) {
      bullet(out, `${item.id} ${item.label}: kept ${kept.join(", ")}, restored after the checks failed on it`);
    }
  }
  return out;
}

export function report({ dir, repo }) {
  const { items: offered, rejected, weak, notes } = readJson(join(dir, "items.json"));
  const record = existsSync(join(dir, "approved.json")) ? readJson(join(dir, "approved.json")) : null;
  const approved = record?.approved ?? [];
  const declined = record?.declined ?? offered;
  const reverted = existsSync(join(dir, "reverted.json")) ? readJson(join(dir, "reverted.json")) : [];
  const out = ["## Clean house", ""];
  out.push("### Deleted", "", ...(approved.length > 0 ? deletedSection(approved, repo) : ["- Nothing."]), "");
  const ported = approved.flatMap((item) => item.ports.map((port) => `${item.id}: ${port}`));
  out.push("### Ported first", "", ...(ported.length > 0 ? ported.map((line) => `- ${line}`) : ["- Nothing."]), "");
  out.push("### Kept", "");
  for (const item of declined) {
    bullet(out, `${item.id} ${item.label}: not approved`);
  }
  for (const item of rejected) {
    bullet(out, `${item.id} ${item.label}: not offered, ${item.problem}`);
  }
  for (const line of weak) {
    bullet(out, `Weak, left alone: ${line}`);
  }
  if (declined.length + rejected.length + weak.length === 0) {
    out.push("- Nothing.");
  }
  if (reverted.length > 0) {
    out.push("", "### Reverted", "");
    for (const entry of reverted) {
      bullet(out, `${entry.path} (${entry.kind}): ${entry.reason}`);
    }
  }
  if (notes) {
    out.push("", "### Notes", "", notes);
  }
  const text = `${out.join("\n")}\n`;
  writeFileSync(join(dir, "report.md"), text);
  return text;
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const parsed = { command };
  for (const arg of rest) {
    const match = OPTION.exec(arg);
    if (!match) {
      throw new Error(`unknown argument: ${arg}`);
    }
    parsed[match[1]] = match[2];
  }
  if (!parsed.dir) {
    throw new Error("missing --dir");
  }
  return parsed;
}

const COMMANDS = {
  options: (args) => JSON.stringify(options(args)),
  approve: (args) => JSON.stringify(approve(args)),
  checks: (args) => checks(args),
  ports: (args) => JSON.stringify(ports(args)),
  gate: (args) => JSON.stringify(gate(args)),
  report: (args) => report(args).trimEnd(),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const run = COMMANDS[args.command];
    if (!run) {
      throw new Error(`unknown command: ${args.command}`);
    }
    process.stdout.write(`${run(args)}\n`);
  } catch (error) {
    process.stderr.write(`clean: ${error.message}\n`);
    process.exit(2);
  }
}
