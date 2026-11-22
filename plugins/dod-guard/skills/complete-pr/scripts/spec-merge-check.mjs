// Confirms that a ticket branch merged its parent issue's behavior into
// `openspec/specs/` before complete-pr marks the pull request ready. It reads
// each capability spec from git at the verified head, not from the working
// tree and not through the OpenSpec CLI, so an uncommitted file or a missing
// CLI can neither pass nor block the gate.
//
//   node spec-merge-check.mjs --body-file=<path> --head-sha=<sha> --root=<checkout>
//
// Prints one JSON object. Exit 0: `ok`, or `skipped` for a legacy body with no
// capability-tagged requirement. Exit 1: `spec-merge-missing` (an ADDED or
// MODIFIED requirement is absent, or a REMOVED one is still present), or
// `invalid` when the body no longer maps. Exit 2: a bad argument, an unreadable
// body, or a head that is not a commit of the checkout.
// biome-ignore lint/correctness/noNodejsModules: the check reads specs from git at the head commit
import { spawnSync } from "node:child_process";
import process from "node:process";
import { markedLines } from "../../../lib/acceptance-criteria.mjs";
import { parseArgs } from "../../../lib/args.mjs";
import { bodyToChange } from "../../../lib/openspec-issue-map.mjs";
import { readTextFile } from "../../../lib/read-text.mjs";

const USAGE = "usage: node spec-merge-check.mjs --body-file=<path> --head-sha=<sha> --root=<checkout>";
const REQUIREMENT = /^### +Requirement: *(.+?)\s*$/;
const SHA = /^[0-9a-f]{7,64}$/i;

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

// Requirement names of one capability at the head. A capability with no spec
// file yet has no requirements, which makes every ADDED one of it missing.
function specRequirements(root, sha, path) {
  const listed = git(root, ["ls-tree", "--name-only", sha, "--", path]);
  if (listed.status !== 0) throw new Error(`git ls-tree ${sha} ${path} failed: ${listed.stderr.trim()}`);
  if (listed.stdout.trim() === "") return new Set();
  const shown = git(root, ["show", `${sha}:${path}`]);
  if (shown.status !== 0) throw new Error(`git show ${sha}:${path} failed: ${shown.stderr.trim()}`);
  const names = markedLines(shown.stdout)
    .filter((line) => !line.fenced)
    .map((line) => REQUIREMENT.exec(line.text)?.[1])
    .filter(Boolean);
  return new Set(names);
}

function findings(requirements, root, sha) {
  const specs = new Map();
  const out = [];
  for (const { id, operation, capability, name } of requirements) {
    const path = `openspec/specs/${capability}/spec.md`;
    if (!specs.has(path)) specs.set(path, specRequirements(root, sha, path));
    const present = specs.get(path).has(name);
    // RENAMED never reaches here: the mapper refuses it, so the body is `invalid`.
    if (operation === "REMOVED" && present) out.push({ id, operation, name, path, problem: "still-present" });
    if (operation !== "REMOVED" && !present) out.push({ id, operation, name, path, problem: "missing" });
  }
  return out;
}

function usageProblem(args) {
  if (!(args?.["body-file"] && args.root && SHA.test(args["head-sha"] ?? ""))) return USAGE;
  if (git(args.root, ["cat-file", "-e", `${args["head-sha"]}^{commit}`]).status !== 0) {
    return `${args["head-sha"]} is not a commit of ${args.root}`;
  }
  return null;
}

function run(argv) {
  const args = parseArgs(argv);
  const problem = usageProblem(args);
  if (problem) return { code: 2, error: problem };
  let body;
  try {
    body = readTextFile(args["body-file"]);
  } catch (error) {
    return { code: 2, error: `cannot read ${args["body-file"]}: ${error.message}` };
  }
  const change = bodyToChange(body);
  if (change.legacy) return { code: 0, out: { status: "skipped", reason: change.problems[0].message } };
  if (change.problems.length > 0) return { code: 1, out: { status: "invalid", problems: change.problems } };
  let found;
  try {
    found = findings(change.requirements, args.root, args["head-sha"]);
  } catch (error) {
    return { code: 2, error: error.message };
  }
  if (found.length > 0) return { code: 1, out: { status: "spec-merge-missing", findings: found } };
  return { code: 0, out: { status: "ok", findings: [] } };
}

const result = run(process.argv.slice(2));
if (result.error) process.stderr.write(`${result.error}\n`);
if (result.out) process.stdout.write(`${JSON.stringify(result.out)}\n`);
process.exitCode = result.code;
