import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { commitAll, git, initRepo, scratch } from "../../archon-shared/scripts/testing.mjs";
import { approve, final, GateFailure, gate, leak, merge, NONE, options, report, verbatim } from "./migrate.mjs";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TARGET = "skills/demo/SKILL.md";
const ORIGINAL = [
  "---",
  "name: demo",
  // As long as a real skill's description: the merge copies it back, so a
  // gate that scanned the frontmatter would fail every rewrite on it.
  "description: Check one file with the strict checker and report the outcome. " +
    "Use when the user asks whether a file passes, or before handing a change back for review.",
  "---",
  "",
  "# Demo",
  "",
  "IMPORTANT: You MUST ALWAYS read the whole file before you begin, every single time, without exception.",
  "Then run the check below and read its output carefully before you say anything at all to the user.",
  "Never skip the check because the change looks small, since small changes break things too.",
  "If the check fails, read the failing line, fix the cause, and run the check again until it passes.",
  "",
  "```bash",
  "node scripts/check.mjs --strict",
  "```",
  "",
  "Report the result to the user in one short paragraph that names the file and the outcome.",
  "Do not paste the whole check output into the report; quote only the lines that matter.",
  "",
].join("\n");

const PREFIX = "skill-migrate-";

function fixture(t) {
  const repo = initRepo(t, PREFIX);
  mkdirSync(join(repo, "skills", "demo"), { recursive: true });
  writeFileSync(join(repo, TARGET), ORIGINAL);
  commitAll(repo);
  const dir = scratch(t, PREFIX);
  const check = spawnSync(
    process.execPath,
    [
      join(PACK, "skills", "skill-migrate", "scripts", "migration-check.mjs"),
      join(repo, TARGET),
      `--save=${join(dir, "baseline.json")}`,
    ],
    { encoding: "utf8" },
  );
  assert.ok(check.status === 0 || check.status === 1, check.stderr);
  writeFileSync(
    join(dir, "contract.md"),
    "## Contract: demo\n\n### Verbatim (copy exactly)\n- node scripts/check.mjs --strict\n\n" +
      "### REQUIRED\n- Runs the check.\n",
  );
  verbatim({ dir });
  return { repo, dir, base: { dir, repo, target: TARGET, commit: git(repo, ["rev-parse", "HEAD"]), pack: PACK } };
}

const REWRITE = [
  "Goal: a verified answer about one file.",
  "",
  "Acceptance: the strict check exits 0 on the final state, and the user gets a brief summary " +
    "naming the file, its outcome, and any failing lines worth quoting.",
  "",
  "Gate:",
  "",
  "```bash",
  "node scripts/check.mjs --strict",
  "```",
  "",
  "A red result is work, not news: repair what it points at and repeat.",
  "",
].join("\n");

test("the Verbatim section becomes one item per line without its marker", (t) => {
  const { dir } = fixture(t);
  assert.equal(readFileSync(join(dir, "verbatim.txt"), "utf8"), "node scripts/check.mjs --strict\n");
});

test("the form offers SCAFFOLDING cuts with both outcomes, and the answer text is the reason", (t) => {
  const dir = scratch(t, PREFIX);
  writeFileSync(
    join(dir, "cuts.json"),
    JSON.stringify({
      cuts: [
        {
          id: "s1",
          kind: "claim",
          value: "Shouts IMPORTANT before the first rule.",
          keep: "it shouts",
          cut: "it states",
        },
        { id: "s2", kind: "text", value: "IMPORTANT:", keep: "kept", cut: "cut" },
        { id: "bad", kind: "text", value: "x", keep: "" },
      ],
    }),
  );
  const form = options({ dir });
  assert.deepEqual(
    form.options.map((option) => option.id),
    ["s1", "s2", NONE],
  );
  assert.match(form.message, /bad: not offered, names no keep; it is kept/);
  approve({ dir, answer: JSON.stringify({ decisions: ["s1", "s2"], text: "too loud for new models" }) });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "approvals.json"), "utf8")).approvedCuts, [
    { claim: "Shouts IMPORTANT before the first rule.", reason: "too loud for new models" },
    { text: "IMPORTANT:", reason: "too loud for new models" },
  ]);
  approve({ dir, answer: JSON.stringify({ decisions: [NONE, "s1"], text: "" }) });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "approvals.json"), "utf8")).approvedCuts, []);
  assert.match(readFileSync(join(dir, "corrections.md"), "utf8"), /no corrections/);
});

test("merge keeps the original frontmatter and drops any the writer added", (t) => {
  const { dir, base } = fixture(t);
  writeFileSync(join(dir, "body.md"), `---\nname: wrong\n---\n\n${REWRITE}`);
  merge(base);
  const migrated = readFileSync(join(dir, "migrated.md"), "utf8");
  assert.ok(migrated.startsWith("---\nname: demo\n"));
  assert.doesNotMatch(migrated, /name: wrong/);
});

test("a copy of the original fails the gate as too close and is thrown away", (t) => {
  const { dir, base } = fixture(t);
  writeFileSync(join(dir, "body.md"), ORIGINAL);
  assert.equal(gate(base), "too close");
  assert.equal(readFileSync(join(dir, "feedback.md"), "utf8"), "too close\n");
  assert.equal(existsSync(join(dir, "body.md")), false);
  assert.equal(existsSync(join(dir, "original-gate")), false);
});

test("a real rewrite passes the gate; final also needs the audit and approvals", (t) => {
  const { repo, dir, base } = fixture(t);
  writeFileSync(join(dir, "body.md"), REWRITE);
  assert.equal(gate(base), "PASS", readFileSync(join(dir, "overlap.json"), "utf8"));
  writeFileSync(join(dir, "approvals.json"), JSON.stringify({ approvedCuts: [] }));
  assert.throws(
    () => final(base),
    (error) => error instanceof GateFailure && /audit/.test(error.message),
  );
  writeFileSync(join(dir, "audit.md"), "## Audit\n\nNo gaps.\n\n### Approved cuts\n\n- None.\n");
  assert.equal(final(base), "PASS");
  const text = report({ dir, repo, target: TARGET });
  assert.match(text, /The target is unchanged/);
  assert.match(text, /### Approved cuts\n\n- None\./);
  assert.match(text, /```diff\n.*\n[\s\S]*-IMPORTANT: You MUST ALWAYS/);
  assert.equal(readFileSync(join(repo, TARGET), "utf8"), ORIGINAL);
});

test("a dropped exact command fails final", (t) => {
  const { dir, base } = fixture(t);
  writeFileSync(join(dir, "body.md"), "# Demo\n\nRead the target file in full first, then run the strict check.\n");
  writeFileSync(join(dir, "approvals.json"), JSON.stringify({ approvedCuts: [] }));
  writeFileSync(join(dir, "audit.md"), "### Approved cuts\n\n- None.\n");
  assert.throws(() => final(base), GateFailure);
});

test("a writer input that quotes the original leaks; one in its own words passes", (t) => {
  const { dir, base } = fixture(t);
  writeFileSync(
    join(dir, "classification.md"),
    "## Classification\n\n- ESSENTIAL: the strict check runs before any report.\n",
  );
  writeFileSync(
    join(dir, "inventory.md"),
    "Goal: check one file.\n\nRules: Then run the check below and read its output carefully " +
      "before you say anything at all to the user.\n",
  );
  assert.equal(leak(base), "inventory.md");
  assert.match(
    readFileSync(join(dir, "leak.md"), "utf8"),
    /^- inventory\.md: its longest run of words shared with the original is \d+/,
  );
  assert.throws(() => leak({ ...base, strict: "true" }), GateFailure);
  writeFileSync(
    join(dir, "inventory.md"),
    "Goal: check one file.\n\nThe skill gates its report on `node scripts/check.mjs --strict` passing.\n",
  );
  assert.equal(leak({ ...base, strict: "true" }), "PASS");
  assert.equal(existsSync(join(dir, "leak.md")), false);
  assert.equal(existsSync(join(dir, "original-gate")), false);
});

function cli(args) {
  const script = join(dirname(fileURLToPath(import.meta.url)), "migrate.mjs");
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("on the command line a strict leak exits 1 and any other error exits 2", (t) => {
  const { dir, base } = fixture(t);
  writeFileSync(join(dir, "classification.md"), "## Classification\n");
  writeFileSync(
    join(dir, "inventory.md"),
    "Rules: Then run the check below and read its output carefully before you say anything at all to the user.\n",
  );
  const flags = ["dir", "repo", "target", "commit", "pack"].map((name) => `--${name}=${base[name]}`);
  const strict = cli(["leak", ...flags, "--strict=true"]);
  assert.equal(strict.status, 1, strict.stderr);
  assert.equal(strict.stdout, "");
  assert.match(strict.stderr, /^skill-migrate: still too close to the original after rewording:\n- inventory\.md:/);
  const loose = cli(["leak", ...flags]);
  assert.equal(loose.status, 0, loose.stderr);
  assert.equal(loose.stdout, "inventory.md\n");
  const missing = cli(["leak"]);
  assert.equal(missing.status, 2);
  assert.equal(missing.stderr, "skill-migrate: missing --dir\n");
});
