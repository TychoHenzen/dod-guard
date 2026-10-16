---
name: review-pr
description: Review a GitHub pull request's changed files with the quality-guard scanner and four independent reviewer agents, then post one comment-only review with GH-<id> findings and a recommendation. Loads the linked PBI first. GitHub only.
argument-hint: "[PR URL or number; default: the open PR for the current branch]"
---

# Review PR

This skill adds what the scanner cannot judge to a quality-refactor pass:
correctness, PBI acceptance, wiring, and failure handling.

Ground rules:

- Read `standards/working-defaults.md` and `standards/github-request-discipline.md`
  (paths relative to the plugin root) before you start. Where this skill is
  stricter, this skill wins.
- Never edit files, approve, mark ready, merge, or close anything. Fixes belong
  to `dod-guard:fix-pr-review`.
- One PR gets one comment-only review, and you never post a second review.
- Scratch files live outside the repository. Delete them after posting.
- `<skill-dir>` means `${CLAUDE_PLUGIN_ROOT}/skills/review-pr` in Claude Code
  and the directory holding this file in Codex.
- Each script flag is its own native argument, per
  [the command-composition contract](../../docs/command-composition.md).
- Model tiers come from `standards/model-routing.md`.

## 1. Resolve PR and PBI

Find the repository by the "Resolve the repository and Project" section of
`standards/github-request-discipline.md`. The PR is the URL or number you were
given; without one, it is the open PR whose head is the current branch. If no PR
exists, stop.

The scanner and the reviewers read the working tree, so check it first. Local
`HEAD` must equal the PR head SHA, and `git status --porcelain` must print
nothing. If either fails, stop and name the SHAs or the pending paths. Do not
switch branches, stash, or create a worktree.

The parent PBI comes from the PR's closing issue, or from the `codex/<issue>-<slug>`
branch segment. Fetch it and its sub-issues. If none resolves, stop and name the
missing PBI.

```text
gh api "repos/{owner}/{repo}/issues/{n}"
gh api --paginate --slurp "repos/{owner}/{repo}/issues/{n}/sub_issues?per_page=100"
```

## 2. One review per PR

Do this before any expensive work. Save the PR's existing reviews, then ask the
script whether one carries the marker.

```text
gh api --paginate --slurp "repos/{owner}/{repo}/pulls/{n}/reviews?per_page=100"
```

```text
node "<skill-dir>/scripts/review-findings.mjs" existing --reviews=<reviews.json>
```

On `found: true`, report that review's recommendation, head, and URL, and stop.
A later commit, such as remediation by `dod-guard:fix-pr-review`, does not
justify a new review unless the user asks for one.

## 3. Diff and slots

One diff drives everything. Save it against the merge base with the PR base
branch. The scripts read changed files and added lines from it, including Git's
quoted paths, so no separate file list is needed.

```text
git diff --unified=0 --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ <merge-base> HEAD
```

Then cut the review into slots:

```text
node "<skill-dir>/scripts/review-findings.mjs" slots --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --out=<slots.json>
```

- `file:<path>` for each changed file with an added line.
- `criterion:<n>` for each checkbox item under the PBI's `## Acceptance criteria`, checked or not, in document order.
- `sub-issue:<owner/name>#<number>` for each linked sub-issue.

Deletion-only files, pure renames, and binary files get no slot. A PBI with no
sub-issues is valid. The script stops and names the PBI if it has no checkbox
criterion, or names the file if an input is missing or malformed. The slots are fixed: the planner cannot add, drop, or rename one.

## 4. Scan

The scanner's output is limited by this rule:
Structural rules such as complexity, length, duplication, nesting, parameters,
and dead or test-only exports cover each whole changed file, including what it
had before this PR: a touched file's design debt is in scope. Line-level rules
such as `line-length` and the comment rules cover only the lines this PR adds.

Save the plugin list for your client and check its exit status. The scan script uses
it to locate the installed quality-guard scanner, then scans the whole repository
(a changed-files-only scan would report every export as dead). Stop if
quality-guard is missing or the scan fails, and never guess a cache path.

```text
claude plugin list --json
codex plugin list --json
node "<skill-dir>/scripts/review-findings.mjs" scan --client=<claude|codex> --registry=<plugins.json> --root=<repository> --out=<scan.json>
```

Next, filter the scan to the diff. `violations` numbers every in-scope violation `S1..Sn` in file, line, rule, and message order.

```text
node "<skill-dir>/scripts/review-findings.mjs" violations --scan=<scan.json> --diff=<unified0.diff> --out=<violations.json>
```

## 5. Plan, investigate, judge, merge

This step runs the plan, investigate, and judge split in `standards/model-routing.md`,
with a verify stage after investigation and a merge stage after judging.

Every stage gets the same brief: PR number and URL, base and head SHAs, the slots
file, the diff file path, the violations file, the PBI acceptance criteria and
sub-issues verbatim, and the paths of the governing `AGENTS.md` and `CLAUDE.md`.

| Stage | Claude Code agent |
|---|---|
| Planner | `dod-guard:read-standard` |
| Investigators | `dod-guard:read-cheap` |
| Judges | `dod-guard:review-pr-feature`, `dod-guard:review-pr-design`, `dod-guard:review-pr-reliability`, `dod-guard:review-pr-hygiene` |
| Merge pass | `dod-guard:read-standard` |

Claude Code runs each through the Agent tool with the stage's tier model and
effort. Codex uses the matching `dod_guard_*` agents when the project registers
them in `.codex/agents/`. If it does not, spawn an explorer whose message holds
the full definition from `<plugin-root>/agents/`, and record the stage as "requested, not pinned".

1. **Plan.**
   - One `dod-guard:read-standard` planner fills every slot and returns a JSON array with one entry per slot.
   - An entry is `{ "slot", "questions" }` or `{ "slot", "excluded": { "lens", "reason" } }`. Copy slot ids exactly and never add a slot.
   - A question carries `id`, `lens`, `question`, `files`, and the risk it targets. The lenses are `review-pr-feature`, `review-pr-design`, `review-pr-reliability`, and `review-pr-hygiene`. Each lens gets at least one question or exclusion. Ids are unique across all four lenses.
   - A slot that needs no question gets one exclusion that names the lens that owns it and the reason; a slot never has both.
   - For each `file:` slot with in-scope violations, the planner writes scanner check questions that list the `S` ids they cover in a `scanner` array. The questions ask whether the violation shows at the reviewed head, whether the path is generated or excluded, and whether the rule's own condition holds.
2. **Investigate.**
   - The `dod-guard:read-cheap` investigators answer every question, batched by slot, at most eight questions each.
   - An answer names the slot, the question id, a cited path and line, and the fact found.
   - Nobody investigates an exclusion.
3. **Verify.**
   - Before judging, the main thread checks every answer against the cheap-output rule in that standard, with the reviewed head as the accepted head.
   - Send a failed batch back once with the exact gap. If it fails again, run that batch once on `dod-guard:read-standard` with the failure record; if it fails the same check there, stop without posting, name the batch, and report the stop to the dispatcher, which does not rerun the review stage.
   - Save the plan JSON with a `status` on each question: `verified`, `repaired` (verified after the one repair), or `unanswered` (the repository does not answer it).
   - The build regenerates the slots and refuses a plan that misses, adds, or leaves empty a slot.
4. **Judge.**
   - Dispatch the four reviewers at once. Each gets the shared brief and its assigned slots, with their questions, answers, answer statuses, or exclusions. A slot is assigned to a lens when it has a question of that lens or an exclusion that names that lens.
   - Each reviewer judges from that evidence instead of re-reading the whole diff. It returns one ruling for every slot assigned to its lens.
   - For an `unanswered` question of its lens, the reviewer settles it from the files the question names or reports the gap as a finding; it never counts one as passing. It also reports an exclusion assigned to its lens as a finding when its reason does not hold.
   - Each returns one JSON object with `reviewer`, `rulings`, and `findings`. A ruling is `{ "slot", "status", "evidence" }`, and status is `VERIFIED` or `FINDING`.
   - Save the four objects as one JSON array. On malformed JSON, send one correction request in the exact format. If that fails too, stop without posting and name the reviewer; a format failure is not escalated to another tier. The review posts once, so a missed angle stays missed.
5. **Merge.**
   - Run `candidates`. It numbers the judged findings `J1..Jn` and repeats the `S` ids.

   ```text
   node "<skill-dir>/scripts/review-findings.mjs" candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --out=<candidates.json>
   ```

   - When the candidates file lists no finding and no violation, save `{ "groups": [], "scanner": [] }` as the merge file without dispatching the pass.
   - Otherwise one `dod-guard:read-standard` pass reads the candidates file and the saved plan, through the Agent tool in Claude Code or the registered `dod_guard_read_standard` agent in Codex. It returns an object of this shape, which you save as the merge file:

   ```json
   { "groups": [{ "members": ["J1", "J3"], "representative": "J1" }], "scanner": [{ "ids": ["S1"], "status": "KEEP" }, { "ids": ["S2"], "status": "DROP", "reason": "rule-misfire", "answer": "D4" }] }
   ```

   - Every `J` id is in exactly one group, and a finding no other lens repeated forms a one-member group. A group joins only findings that cite the same defect in the same file, and its representative is one of its members.
   - Every `S` id is in exactly one scanner ruling. The ruling is `KEEP`, unless one of `not-at-head`, `excluded-path`, or `rule-misfire` holds and a `verified` or `repaired` scanner check question listing that `S` id shows it. Then the ruling is `DROP`, with that reason and the question id as `answer`.
   - The pass never sets a severity. Whether a violation is pre-existing or unchanged at base is never a reason to drop it.
   - If the build refuses the pass output, send the pass one correction request with the build's exact error. If it is refused again, stop without posting and name the merge pass. Capability is not the issue, so a refused build is not escalated to another tier.

## 6. Build and post

`build` takes the full 40-character head SHA and every earlier file:

```text
node "<skill-dir>/scripts/review-findings.mjs" build --head=<full 40-character head SHA> --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --merge=<merge.json> --out=<payload.json>
```

What the build enforces:

- Slots come from `--diff`, `--pbi`, and `--sub-issues`, never from a slot list the planner returns. It refuses a plan, naming the slot or question id, when a generated slot is missing, a planned slot was not generated, a slot has neither questions nor an exclusion or has both, a question or exclusion is incomplete, a question id repeats, or a lens has no question or exclusion.
- It refuses results that lack any of the four reviewers or come from a reviewer outside the four. It refuses a `FINDING` ruling from a reviewer that returned no findings. It names the reviewer and slot for a missing, duplicate, or unassigned ruling or an unknown status.
- It regenerates the `J` and `S` ids from its own inputs and never reads them from a file. It refuses the merge output, naming the id or group at fault, when:
  - a `J` id is missing, duplicated, or unknown;
  - a representative is not a member;
  - a group spans files;
  - an `S` ruling is missing or duplicated or has a status other than `KEEP` or `DROP`;
  - a `DROP` reason is not `not-at-head`, `excluded-path`, or `rule-misfire`;
  - a `DROP` cites a question that is not `verified` or `repaired`, or that does not list that `S` id;
  - the output carries any severity field.
- If the body would pass GitHub's 65536-character limit, it refuses before posting. Shorten question text in the saved plan and rebuild.

What the posted review contains:

- Judged findings: one finding per group with the representative's text, the highest member severity, and every member lens. Each `BLOCKER` and `MAJOR` is an inline comment with its own `GH-<id>`. `MINOR` findings go in a "Minor notes" list in the review body; they open no thread, need no reply, and do not block.
- Scanner findings: the build groups only kept scanner violations into one comment per changed file, and lists dropped violations by file and rule in a collapsed block in the body, with `S` ids, lines, reasons, and answer ids. A scanner group never moves to another file; with no added line in its file, it is listed in the body under its own file and line, with no `GH-<id>`.
- When the diff adds no line, blocking findings are listed in the review body without a `GH-<id>`.
- Every slot, with its questions and statuses or its exclusion lens and reason, sits in a collapsed `<details>` block in the review body.
- A judged finding whose cited line this PR did not add moves to the nearest added line of its file, or to the file's first added line. A file outside the diff also uses its first added line. The body of the finding names the
cited location. Severity: reviewer `BLOCKER`/`MAJOR`/`MINOR` as given. A
file's scanner findings are `MAJOR` when any is `high`, otherwise `MINOR`.

The recommendation follows the worst severity: any `BLOCKER` is `BLOCK`, any `MAJOR` is `REQUEST_CHANGES`, and only `MINOR` findings or none is `APPROVE`.

Then post:

1. Reread the PR head. If it moved, stop.
2. Post the payload as one review. The review event is always `COMMENT`, and the body carries the `dod-guard:review-pr` marker that step 2 detects.
3. If the post fails or its outcome is unclear, rerun step 2 before any retry, and never post a second review.

```text
gh api --method POST "repos/{owner}/{repo}/pulls/{n}/reviews" --input <payload.json>
```

## 7. Report

Save the PR's review comments and run:

```text
node "<skill-dir>/scripts/review-findings.mjs" report --review-id=<posted id> --comments=<comments.json>
```

Give the PR, head SHA, PBI, `Recommendation`, and review URL. List each finding
as `GH-<id>`, severity, and `file:line`. A caller passes those `GH-` ids on to
`dod-guard:fix-pr-review`.
