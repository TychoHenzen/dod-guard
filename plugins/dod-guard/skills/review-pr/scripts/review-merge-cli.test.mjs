import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const SKILL = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const FIXTURE = fileURLToPath(new URL("fixtures/pr-909/", import.meta.url));
const FILE = "plugins/dod-guard/skills/next-ticket/scripts/handoff-proof.test.mjs";
const HEAD = "0909".repeat(10);
const SLOT_INPUTS = ["unified0.diff", "pbi.json", "sub-issues.json"];
const INPUTS = ["scan.json", ...SLOT_INPUTS, "plan.json", "results.json"];
const OUTPUTS = ["violations.json", "candidates.json", "payload.json", "scanner-comments.json"];
const PLACEHOLDER = /<[^>]+>/;
const FLAG_START = / (?=--)/;
const REFUSED = /The merge pass output is refused; do not post: .*missing J id J2/;
const MERGED_PROBLEM = /^\*\*MAJOR\*\* The parse-error case asserts the whole result/;
const BOTH_LENSES = /Requirement: AC-1 \(review-pr-feature, review-pr-hygiene\)$/;
const DROPPED_BLOCK = /Dropped scanner findings \(1\)/;
const DROPPED_LINE = /\(rule-misfire, D1\) x1: S1/;

const dirs = [];
after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Every run writes into its own directory, so no test reads another's output.
// The map goes from each SKILL.md placeholder to the path that replaces it.
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-merge-"));
  dirs.push(dir);
  const values = new Map([
    ["<full 40-character head SHA>", HEAD],
    ["<merge.json>", path.join(FIXTURE, "merge.json")],
  ]);
  for (const name of INPUTS) {
    values.set(`<${name}>`, path.join(FIXTURE, name));
  }
  for (const name of OUTPUTS) {
    values.set(`<${name}>`, path.join(dir, name));
  }
  return { dir, values };
}

// Runs the command line SKILL.md documents, with each placeholder filled in,
// so the test breaks when the skill tells an agent to run something else.
function documented(command, values, extra = []) {
  const prefix = `node "<skill-dir>/scripts/review-findings.mjs" ${command} `;
  const line = SKILL.split("\n")
    .map((text) => text.trim())
    .find((text) => text.startsWith(prefix));
  assert.ok(line, `SKILL.md documents no ${command} command line`);
  const fill = (flag) => flag.replace(PLACEHOLDER, (name) => values.get(name) ?? name);
  const flags = line.slice(prefix.length).split(FLAG_START).map(fill);
  const argv = [SCRIPT, command, ...flags, ...extra];
  return spawnSync(process.execPath, argv, { encoding: "utf8", shell: false });
}

function succeeds(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

test("R9: the documented violations, candidates, and build lines post one #909 finding", () => {
  const { values } = scratch();
  const out = (name) => values.get(`<${name}>`);
  const violations = succeeds(documented("violations", values));
  assert.deepEqual(violations, { out: out("violations.json"), violations: 1, files: 1 });
  const candidates = succeeds(documented("candidates", values));
  assert.deepEqual(candidates, { out: out("candidates.json"), judged: 2, scanner: 1 });
  const written = readJson(out("candidates.json"));
  assert.deepEqual(written.scanner, readJson(out("violations.json")));
  const judged = written.judged.map(({ id, reviewer }) => `${id} ${reviewer}`);
  assert.deepEqual(judged, ["J1 review-pr-feature", "J2 review-pr-hygiene"]);
  const built = succeeds(documented("build", values));
  assert.equal(built.recommendation, "REQUEST_CHANGES");
  assert.deepEqual(built.counts, { BLOCKER: 0, MAJOR: 1, MINOR: 1 });
  const { comments } = readJson(out("payload.json"));
  const anchors = comments.map((comment) => `${comment.path}:${comment.line}`);
  assert.deepEqual(anchors, [`${FILE}:90`]);
  assert.match(comments[0].body, MERGED_PROBLEM);
  assert.match(comments[0].body, BOTH_LENSES);
});

test("R10: the documented build line posts a review whose block lists a dropped scanner finding", () => {
  const { values } = scratch();
  const dropFile = path.join(FIXTURE, "merge-drop.json");
  succeeds(documented("candidates", values));
  const built = succeeds(documented("build", new Map([...values, ["<merge.json>", dropFile]])));
  assert.equal(built.recommendation, "REQUEST_CHANGES");
  assert.deepEqual(built.counts, { BLOCKER: 0, MAJOR: 1, MINOR: 0 });
  const { body } = readJson(values.get("<payload.json>"));
  assert.match(body, DROPPED_BLOCK);
  assert.match(body, DROPPED_LINE);
});

// The candidates file is the merge pass's input only; the build regenerates
// the ids, so editing that file cannot move one.
test("R1: build ignores ids edited in the candidates file", () => {
  const { values } = scratch();
  const file = values.get("<candidates.json>");
  const payload = values.get("<payload.json>");
  succeeds(documented("candidates", values));
  const before = succeeds(documented("build", values));
  const untampered = readFileSync(payload, "utf8");
  const written = readJson(file);
  const ids = [...written.judged, ...written.scanner].map(({ id }) => id);
  assert.deepEqual(ids, ["J1", "J2", "S1"]);
  const swapped = new Map([
    ["J1", "J2"],
    ["J2", "J1"],
    ["S1", "S9"],
  ]);
  const tamper = (item) => ({ ...item, id: swapped.get(item.id) });
  const tampered = { judged: written.judged.map(tamper), scanner: written.scanner.map(tamper) };
  writeFileSync(file, JSON.stringify(tampered));
  assert.deepEqual(succeeds(documented("build", values)), before);
  assert.equal(readFileSync(payload, "utf8"), untampered);
  const withIds = documented("build", values, [`--candidates=${file}`]);
  assert.equal(withIds.status, 3, "build must not take a candidates file");
});

test("R7: a refused merge output writes nothing, and the corrected one builds", () => {
  const { dir, values } = scratch();
  const payload = values.get("<payload.json>");
  const refused = path.join(dir, "refused-merge.json");
  const fixture = readJson(values.get("<merge.json>"));
  const groups = [{ members: ["J1"], representative: "J1" }];
  writeFileSync(refused, JSON.stringify({ ...fixture, groups }));
  const first = documented("build", new Map([...values, ["<merge.json>", refused]]));
  assert.notEqual(first.status, 0);
  assert.match(first.stderr, REFUSED);
  assert.throws(() => readFileSync(payload), { code: "ENOENT" });
  const second = succeeds(documented("build", values));
  assert.equal(second.inline, 1);
  assert.equal(readJson(payload).comments.length, 1);
});

test("R11: a merge output refused for both arrays is corrected and then builds", () => {
  const { dir, values } = scratch();
  const payload = values.get("<payload.json>");
  const refused = path.join(dir, "both-arrays-merge.json");
  writeFileSync(refused, JSON.stringify({ groups: "x", scanner: "y" }));
  const first = documented("build", new Map([...values, ["<merge.json>", refused]]));
  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /groups is not an array; scanner is not an array/);
  assert.throws(() => readFileSync(payload), { code: "ENOENT" });
  const second = succeeds(documented("build", values));
  assert.equal(second.inline, 1);
  assert.equal(readJson(payload).comments.length, 1);
});
