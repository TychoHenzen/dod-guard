import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);
const repositoryRoot = new URL("../../../../../", import.meta.url);
const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const usage = await readFile(new URL("USAGE.md", pluginRoot), "utf8");
const REVIEWERS = ["review-pr-feature", "review-pr-design", "review-pr-reliability", "review-pr-hygiene"];

test("review-pr plans, investigates, verifies, then judges in that order", () => {
  const order = [
    "## 3. Diff and slots",
    "## 5. Plan, investigate, judge",
    "One `dod-guard:read-standard` planner",
    "`dod-guard:read-cheap` investigators answer every",
    "Before judging, the main thread checks every answer",
    "Dispatch the four reviewers at once",
    "## 6. Build and post",
  ].map((phrase) => skill.search(prose(phrase)));
  assert.ok(
    order.every((index) => index >= 0),
    `missing step: ${order}`,
  );
  assert.deepEqual(
    [...order].sort((left, right) => left - right),
    order,
  );
  assert.match(skill, prose("the plan, investigate, and judge split in `standards/model-routing.md`"));
  assert.match(skill, prose("cheap-output rule in that standard, with the reviewed head as the accepted head"));
  assert.doesNotMatch(skill, prose("every cited path and line exists"));
  assert.match(skill, prose("Ids are unique across all four lenses"));
  assert.match(
    skill,
    prose("slots --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --out=<slots.json>"),
  );
  assert.match(skill, prose("Deletion-only files, pure renames, and binary files get no slot."));
  assert.match(skill, prose("The slots are fixed: the planner cannot add, drop, or rename one."));
  assert.match(
    skill,
    prose(
      "A slot that needs no question gets one exclusion that names the lens that owns it and the reason; a slot never has both.",
    ),
  );
  assert.match(skill, prose("Nobody investigates an exclusion."));
  assert.match(
    skill,
    prose("The build regenerates the slots and refuses a plan that misses, adds, or leaves empty a slot."),
  );
  assert.match(
    skill,
    prose("A slot is assigned to a lens when it has a question of that lens or an exclusion that names that lens."),
  );
  assert.match(skill, prose("reports an exclusion assigned to its lens as a finding when its reason does not hold"));
  assert.doesNotMatch(skill, /`excluded` entries|changed file unnamed/);
  assert.match(skill, prose("reports the gap as a finding; it never counts one as passing"));
  assert.match(skill, prose("Send a failed batch back once with the exact gap"));
  assert.match(skill, prose("judges from that evidence instead of re-reading the whole diff"));
  assert.match(skill, prose('record the stage as "requested, not pinned"'));
  assert.match(skill, prose("It returns one ruling for every slot assigned to its lens."));
  assert.match(skill, prose("Each returns one JSON object with `reviewer`, `rulings`, and `findings`."));
  assert.match(
    skill,
    prose("names the reviewer and slot for a missing, duplicate, or unassigned ruling or an unknown status"),
  );
  assert.match(skill, prose("a `FINDING` ruling from a reviewer that returned no findings"));
  assert.doesNotMatch(skill, /coverage/i);
});

test("review-pr posts the slot block without changing its boundaries", () => {
  assert.match(skill, prose("--results=<results.json> --merge=<merge.json> --out=<payload.json>"));
  assert.match(skill, prose("never from a slot list the planner returns"));
  assert.match(skill, prose("collapsed `<details>` block in the review body"));
  assert.match(skill, prose("The review event is always `COMMENT`"));
  assert.match(skill, prose("`dod-guard:review-pr` marker that step 2 detects"));
  assert.match(skill, prose("never post a second review"));
  assert.match(skill, prose("Never edit files, approve, mark ready, merge, or close anything."));
  assert.doesNotMatch(skill, /questions\.json/);
  assert.match(skill, prose("blocking findings are listed in the review body without a `GH-<id>`"));
  assert.match(skill, prose('`MINOR` findings go in a "Minor notes" list in the review body'));
  assert.match(skill, prose("only `MINOR` findings or none is `APPROVE`"));
  assert.doesNotMatch(skill, /so each gets a `GH-<id>`/);
});

test("the four reviewers judge on the standard tier in Claude Code and Codex", async () => {
  for (const name of REVIEWERS) {
    const source = await readFile(new URL(`agents/${name}.md`, pluginRoot), "utf8");
    assert.match(source, /^model: sonnet$/m, name);
    assert.match(source, /^effort: medium$/m, name);
    assert.match(source, prose("Judge from that evidence instead of re-reading the whole diff."), name);
    assert.match(source, prose("The brief gives you the slots assigned to this lens"), name);
    const toml = await readFile(
      new URL(`.codex/agents/dod_guard_${name.replaceAll("-", "_")}.toml`, repositoryRoot),
      "utf8",
    );
    assert.match(toml, /^model = "gpt-5\.6-terra"$/m, name);
    assert.match(toml, /^model_reasoning_effort = "medium"$/m, name);
    assert.match(toml, /^sandbox_mode = "read-only"$/m, name);
    for (const [label, text] of [
      ["source", source],
      ["toml", toml],
    ]) {
      assert.match(
        text,
        prose(
          '`rulings` holds one `{ "slot", "status", "evidence" }` entry for every slot assigned to this lens and for no other slot.',
        ),
        `${name} ${label}`,
      );
      assert.match(text, prose("never rule `VERIFIED` on an unanswered question"), `${name} ${label}`);
      assert.match(text, prose("Every `FINDING` ruling needs at least one entry in `findings`."), `${name} ${label}`);
      assert.doesNotMatch(text, /verified answers/, `${name} ${label}`);
      assert.doesNotMatch(text, /coverage/i, `${name} ${label}`);
    }
  }
});

test("USAGE describes the planner, investigators, and judges", () => {
  assert.match(usage, prose("generates fixed review slots from the diff and the PBI"));
  assert.match(usage, prose("cheap investigators answer each question with a cited path and line"));
  assert.match(usage, prose("the four reviewer agents judge them on the standard tier"));
  assert.match(usage, prose("with every slot and its questions in a collapsed block"));
  assert.match(usage, prose("ruling on every slot assigned to their lens"));
  assert.match(usage, prose("blocking findings are listed in the review body without a `GH-<id>`"));
  assert.match(usage, prose('`MINOR` findings are listed under "Minor notes" in the review body'));
  assert.match(
    usage,
    prose("`REQUEST_CHANGES` for any `MAJOR`, and `APPROVE` when only `MINOR` findings or none remain"),
  );
});

// The scanner scope and severity rule is an open owner decision (#870
// unresolved-decision), so this PBI must leave its text exactly as it was at
// b9bcc760.
const SCOPE_RULE = [
  "Structural rules such as complexity, length, duplication, nesting, parameters,",
  "and dead or test-only exports cover each whole changed file, including what it",
  "had before this PR: a touched file's design debt is in scope. Line-level rules",
  "such as `line-length` and the comment rules cover only the lines this PR adds.",
].join("\n");
const SEVERITY_RULE = [
  "cited location. Severity: reviewer `BLOCKER`/`MAJOR`/`MINOR` as given. A",
  "file's scanner findings are `MAJOR` when any is `high`, otherwise `MINOR`.",
].join("\n");

test("review-pr keeps the scanner scope and severity rule byte-identical", () => {
  assert.equal(skill.split("\n").slice(91, 95).join("\n"), SCOPE_RULE);
  assert.ok(skill.includes(SEVERITY_RULE));
});

test("review-pr numbers violations before planning and asks scanner check questions", () => {
  const command = "violations --scan=<scan.json> --diff=<unified0.diff> --out=<violations.json>";
  assert.match(skill, prose(command));
  assert.match(skill, prose("numbers every in-scope violation `S1..Sn` in file, line, rule"));
  assert.match(skill, prose("the diff file path, the violations file"));
  const asked = "the planner writes scanner check questions that list the `S` ids";
  assert.match(skill, prose(asked, "they cover in a `scanner` array"));
  assert.match(skill, prose("whether the violation shows at the reviewed head"));
  assert.match(skill, prose("whether the path is generated or excluded"));
  assert.match(skill, prose("whether the rule's own condition holds"));
});

test("review-pr merges judged findings in one read-standard pass", () => {
  const candidates =
    "candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> " +
    "--sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> " +
    "--out=<candidates.json>";
  assert.match(skill, prose(candidates));
  assert.match(skill, prose("one `dod-guard:read-standard` pass reads the candidates file"));
  assert.match(skill, prose("the registered `dod_guard_read_standard` agent"));
  const groups = ['"groups": [{ "members":', '"representative":'];
  const rulings = ['"scanner": [{ "ids":', '"status": "DROP", "reason":', '"answer":'];
  assert.match(skill, prose(...groups, ...rulings));
  assert.match(skill, prose("Every `J` id is in exactly one group"));
  assert.match(skill, prose("findings that cite the same defect in the same file"));
  assert.match(skill, prose("Every `S` id is in exactly one scanner ruling."));
  assert.match(skill, prose("one of `not-at-head`, `excluded-path`, or `rule-misfire` holds"));
  assert.match(skill, prose("The pass never sets a severity"));
  assert.match(skill, prose("pre-existing or unchanged at base is never a reason"));
  const empty = 'save `{ "groups": [], "scanner": [] }`';
  assert.match(skill, prose(empty, "without dispatching the pass"));
});

// A failed investigator batch climbs one tier once; a format failure or a refused
// build is not a capability failure, so those stops are never escalated.
test("review-pr escalates a failed investigator batch once and never a format failure", () => {
  assert.match(skill, prose("run that batch once on `dod-guard:read-standard` with the failure record"));
  assert.match(skill, prose("if it fails the same check there, stop without posting and name the batch"));
  assert.match(skill, prose("a format failure is not escalated to another tier"));
  assert.match(skill, prose("a refused build is not escalated to another tier"));
});

test("review-pr allows the merge pass one correction, then stops", () => {
  assert.match(skill, prose("send the pass one correction request with the build's exact error"));
  assert.match(skill, prose("refused again, stop without posting and name the merge pass"));
});

test("the build checks the merge output instead of deduping by root cause", () => {
  assert.doesNotMatch(skill, prose("dedupes reviewer findings by file and root cause"));
  assert.match(skill, prose("--results=<results.json> --merge=<merge.json> --out=<payload.json>"));
  assert.match(skill, prose("regenerates the `J` and `S` ids from its own inputs"));
  const refusals = [
    "a `J` id is missing, duplicated, or unknown",
    "a representative is not a member",
    "a group spans files",
    "an `S` ruling is missing or duplicated or has a status other than `KEEP` or `DROP`",
    "a `DROP` reason is not `not-at-head`, `excluded-path`, or `rule-misfire`",
    "a `DROP` cites a question that is not `verified` or `repaired`",
    "does not list that `S` id",
    "the output carries any severity field",
  ];
  assert.match(skill, prose("It refuses the merge output, naming the id", ...refusals));
  assert.match(skill, prose("one finding per group with the representative's text"));
  assert.match(skill, prose("the highest member severity, and every member lens"));
  assert.match(skill, prose("groups only kept scanner violations into one comment per changed"));
  assert.match(skill, prose("lists dropped violations by file and rule in a collapsed block"));
});

test("USAGE describes the merge pass and kept scanner findings", () => {
  const merges = "A standard-tier pass then merges findings that cite the same defect";
  assert.match(usage, prose(merges, "in one file"));
  assert.match(usage, prose("keeps or drops each scanner finding, citing a verified answer"));
  assert.match(usage, prose("the build checks its output"));
  assert.match(usage, prose("kept scanner findings are grouped into one comment per changed file"));
});
