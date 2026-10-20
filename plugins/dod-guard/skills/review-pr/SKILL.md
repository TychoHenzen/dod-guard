---
name: review-pr
description: Review a GitHub pull request's changed files with the quality-guard scanner and four independent reviewer agents, then post one comment-only review with GH-<id> findings and a recommendation. Loads the linked PBI first. GitHub only.
argument-hint: "[PR URL or number; default: the open PR for the current branch]"
---

# Review PR

Review the files a PR changes, adding what the scanner cannot judge: correctness, PBI acceptance, wiring, and failure handling. Post one comment-only review. Never edit files, approve, mark ready, merge, or close anything. `dod-guard:fix-pr-review` owns fixes.

## Ground rules

- Read `standards/working-defaults.md` and `standards/github-request-discipline.md`. Stricter rules here win. Resolve the repository per "Resolve the repository and Project" in the second one.
- Pass every script flag as its own native argument, per the [command-composition contract](../../docs/command-composition.md).
- Keep scratch files outside the repository. Delete them after posting.
- `<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/review-pr` in Claude Code and this file's directory in Codex.
- "Stop" means: post nothing, name the cause, and report to the dispatcher, which does not rerun the review stage.

## 1. Resolve the PR and PBI

1. Take a PR URL or number. With none, use the open PR whose head is the current branch. Stop if there is none.
2. Require local HEAD to equal the PR head SHA and `git status --porcelain` to print nothing, because the scanner and reviewers read the working tree. Otherwise stop and name the SHAs or pending paths. Never switch branches, stash, or create a worktree.
3. Load the parent PBI, with its acceptance criteria and sub-issues, from the PR's closing issue or the issue in the branch name `codex/<issue>-<slug>`. Stop and name the missing PBI if none resolves.

## 2. One review per PR

```
gh api --paginate --slurp "repos/{owner}/{repo}/pulls/{n}/reviews?per_page=100"
node "<skill-dir>/scripts/review-findings.mjs" existing --reviews=<reviews.json>
```

Save the reviews first. If the result is `found: true`, report that review's recommendation, `headSha`, and `url`, then stop. The one exception is the readback that step 6 requires after a failed or ambiguous post: a found review whose `headSha` equals the reviewed head is the posted review, so continue at step 7 with its `reviewId` and make no second POST. A found review at any other head still stops the run. Later commits, including fix-pr-review remediation, never start another review unless the user asks.

## 3. Diff and slots

```
git diff --unified=0 --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/ <merge-base> HEAD
gh api "repos/{owner}/{repo}/issues/{n}"
gh api --paginate --slurp "repos/{owner}/{repo}/issues/{n}/sub_issues?per_page=100"
node "<skill-dir>/scripts/review-findings.mjs" slots --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --out=<slots.json>
```

Diff against the merge base with the PR base branch. The explicit prefixes override user git config. Scripts read changed files and added lines from this diff alone.

Slots are `file:<path>` per changed file with an added line, `criterion:<n>` per checkbox under `## Acceptance criteria` (checked or not), and `sub-issue:<owner/name>#<number>` per linked sub-issue. A PBI without sub-issues is valid. Slots are fixed: the planner cannot add, drop, or rename one. Stop on a script error.

## 4. Scan

```
claude plugin list --json        (Claude Code)
codex plugin list --json         (Codex)
node "<skill-dir>/scripts/review-findings.mjs" scan --client=<claude|codex> --registry=<plugins.json> --root=<repository> --out=<scan.json>
node "<skill-dir>/scripts/review-findings.mjs" violations --scan=<scan.json> --diff=<unified0.diff> --out=<violations.json>
```

Save the client's plugin list and check its exit status. `scan` finds the installed quality-guard from it. Stop if quality-guard is missing or the scan fails. Never guess a cache path. The scan covers the whole repository, since a changed-files-only scan would call every export dead. It skips the checkout's gitignored paths, so build output such as `dist-test/` is never judged.

Structural rules cover each whole changed file, including pre-PR content. Line-level rules (`line-length`, comment rules) cover only added lines. `violations` numbers the in-scope ones S1..Sn.

## 5. Plan, investigate, verify, judge, merge

Follow the plan/investigate/judge split in `standards/model-routing.md`. In Claude Code, use the Agent tool at each stage's model and effort. In Codex, use the `dod_guard_*` agents in `.codex/agents/`. If they are missing, spawn an explorer with the full definition from `<plugin-root>/agents/` and record the stage as "requested, not pinned".

Every stage gets one brief: PR number and URL, base and head SHAs, slots file, diff path, violations file, PBI criteria and sub-issues verbatim, and the governing AGENTS.md and CLAUDE.md paths.

### Plan

One `dod-guard:read-standard` planner returns a JSON array with one entry per slot, copying slot ids exactly. Each entry has `slot` and either `questions` or `excluded`, never both.

- A question has `id` (unique across lenses), `lens`, `question`, `files`, and the targeted risk.
- An exclusion has `lens` and `reason`.
- The lenses are `dod-guard:review-pr-feature` (F), `dod-guard:review-pr-design` (D), `dod-guard:review-pr-reliability` (R), and `dod-guard:review-pr-hygiene` (H). Each gets at least one question or exclusion.
- For a file slot with in-scope violations, add scanner check questions with a `scanner` array of the S ids covered. They ask whether the violation shows at the reviewed head, whether the path is generated or excluded, and whether the rule's own condition holds.

### Investigate

`dod-guard:read-cheap` investigators answer every question, batched by slot, at most eight per investigator. Skip exclusions. Each answer gives slot, question id, cited path and line, and the fact found.

### Verify

Before judging, check every answer under the cheap-output rule in `standards/model-routing.md`, with the reviewed head as accepted head. Send a failed batch back once with the exact gap. On a second failure, rerun it once on `dod-guard:read-standard` with the failure record, per "Escalation". On a third failure of the same check, stop and name the batch.

Save the plan with a status per question: `verified`, `repaired` (verified after the one repair), or `unanswered` (the repo does not answer it).

### Judge

Dispatch the four lens reviewers at once. Each gets the brief plus its lens's slots with questions, answers, statuses, or exclusions, and judges from that evidence. A slot belongs to a lens when it has a question or exclusion naming it.

- Each returns `{ reviewer, rulings, findings }`: one ruling `{ slot, status, evidence }` per assigned
  slot, status `VERIFIED` or `FINDING`, and findings with severity `BLOCKER`, `MAJOR`, or `MINOR`. Each
  finding names its `slot`, one assigned to that lens and ruled `FINDING`. Every `FINDING` ruling has at
  least one finding naming its slot. Build refuses a finding that names no slot, an unassigned slot, or a
  slot ruled `VERIFIED`, and a `FINDING` ruling no finding names.
- Settle each `unanswered` question from the files it names, or report the gap as a finding. Never count one as passing. Report an exclusion as a finding when its reason fails.
- On malformed JSON, send one correction request in the exact format. On a second failure, stop and name the reviewer. Never escalate a format failure to another tier: the review posts once, so a missing angle cannot be added later.

Save the four results as one JSON array.

### Merge

```
node "<skill-dir>/scripts/review-findings.mjs" candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --out=<candidates.json>
```

`candidates` numbers judged findings J1..Jn. One `dod-guard:read-standard` pass (`dod_guard_read_standard` in Codex) reads that file and the plan and returns the merge JSON: `{ "groups": [{ "members": ["J1"], "representative": "J1" }], "scanner": [{ "ids": ["S1"], "status": "KEEP" }] }`.

- Put every J id in exactly one group. Group only findings citing the same defect in the same file. The representative is a member.
- Put every S id in exactly one scanner ruling. Use KEEP unless `not-at-head`, `excluded-path`, or `rule-misfire` holds and a verified or repaired scanner question listing that S id shows it. A DROP adds `"reason"` and `"answer": "<question id>"`.
- Set no severity. "Pre-existing" or "unchanged at base" is never a reason to drop.

With no finding and no violation, write `{ "groups": [], "scanner": [] }` and skip the pass. If the build refuses the output, send one correction request with its exact error. On a second refusal, stop and name the merge pass. Never escalate the tier.

## 6. Build and post

```
node "<skill-dir>/scripts/review-findings.mjs" build --head=<full 40-character head SHA> --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --merge=<merge.json> --out=<payload.json>
gh api --method POST "repos/{owner}/{repo}/pulls/{n}/reviews" --input <payload.json>
```

`build` regenerates ids and slots from its own inputs, validates the plan, results, and merge file, and prints the recommendation and severity counts. If the body would pass 65536 characters, it refuses: shorten question text in the saved plan and rebuild.

BLOCKER and MAJOR findings are inline comments, each with a `GH-<id>`. MINOR findings go in "Minor notes" in the body. A file's scanner findings are MAJOR when any is `high`, else MINOR. Any BLOCKER gives `BLOCK`, else any MAJOR gives `REQUEST_CHANGES`, else `APPROVE`. The body carries the marker `<!-- dod-guard:review-pr head=<sha> recommendation=<REC> -->` that step 2 detects.

Reread the PR head and stop if it moved. Post the payload as one review with event `COMMENT`. A post is ambiguous when it returns a 5xx status, times out, or returns a body you cannot read, because the review may exist even though the call failed. After any failed or ambiguous post, rerun step 2 before any retry and act on its result:

- `found: false`: post the same payload once more.
- `found: true` with `headSha` equal to the reviewed head: that review is the one you posted. Do not post. Continue at step 7 with its `reviewId`.
- `found: true` with any other `headSha`: stop, as step 2 says.

Never post a second review.

## 7. Report

```
node "<skill-dir>/scripts/review-findings.mjs" report --review-id=<posted id> --comments=<comments.json>
```

Save the PR's review comments first. Report the PR, head SHA, PBI, `Recommendation`, review URL, and each finding as `GH-<id>`, severity, and file:line. Callers pass the GH ids to `dod-guard:fix-pr-review`.