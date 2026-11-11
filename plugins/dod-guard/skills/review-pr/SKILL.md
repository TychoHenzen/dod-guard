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
- Read files with the Read tool, search with Grep and Glob, and list a directory with Glob. A shell `grep`, `cat`, `head`, `tail`, `sed`, `find` or `ls` run as the first command can be blocked by a hook and fail, so use a shell only for the commands this skill names.
- Resume from files, never from memory. When your brief names the scratch directory of an earlier owner of this same review and its name carries this PR and head, trust its files: rerun steps 1 to 4, which are deterministic, reuse `plan.json` when it exists, run `pending` at Investigate and dispatch only the batches it lists, and at Judge dispatch only the lenses without a valid `judge-<lens>.json`. Never reuse a directory whose name carries another head.
- Use one scratch directory outside the repository, named `review-pr-<pr-number>-<first 12 characters of the head SHA>` under the session scratchpad, else the OS temp directory, once step 1 has fixed the head. Create it when it is absent, and save every file this review writes in it: reviews, slots, scan, violations, plan, batches, answers, results, merge, payload, comments. The planner, the four lens judges and the merge pass are read-only and create no file, so the main thread writes the plan, results and merge files from their returned text. Only an investigator batch writes a file: the one answers file its brief names, in the answers directory. After posting, delete only the files this review wrote in that directory and then the directory, and never delete a path outside it or a file the review did not write. Leave any other file in place and name it in the report.
- `<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/review-pr` in Claude Code and this file's directory in Codex.
- "Stop" means: post nothing, name the cause, name the one next action for the user or dispatcher when this skill gives one, and report to the dispatcher, which does not rerun the review stage. Never run that action yourself; a new review runs only when the user asks.

## 1. Resolve the PR and PBI

1. Take a PR URL or number. With none, use the open PR whose head is the current branch. Stop if there is none.
2. Require local HEAD to equal the PR head SHA and `git status --porcelain` to print nothing, because the scanner and reviewers read the working tree. Never switch branches, stash, or create a worktree. Otherwise stop:
   - HEAD differs: name both SHAs and report `gh pr checkout <n>` (the PR number) for the user to run from a clean tree.
   - Pending paths: list them and report that the user must commit or discard them first; suggest no stash.
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

Diff against the merge base with the PR base branch. The explicit prefixes override user git config. Scripts read changed files, added lines and removed lines from this diff alone.

Slots are `file:<path>` per changed file with an added line, `criterion:<n>` per checkbox under `## Acceptance criteria` (checked or not), and `sub-issue:<owner/name>#<number>` per linked sub-issue. A PBI without sub-issues is valid. Slots are fixed: the planner cannot add, drop, or rename one. Stop on a script error.

## 4. Scan

```
claude plugin list --json        (Claude Code)
codex plugin list --json         (Codex)
node "<skill-dir>/scripts/review-findings.mjs" scan --client=<claude|codex> --registry=<plugins.json> --root=<repository> --out=<scan.json>
node "<skill-dir>/scripts/review-findings.mjs" violations --scan=<scan.json> --diff=<unified0.diff> --out=<violations.json>
```

Save the client's plugin list and check its exit status. Write it from a POSIX shell (`claude plugin list --json > plugins.json`), or in PowerShell with `claude plugin list --json | Out-File -Encoding utf8 plugins.json`. `scan` also reads the UTF-8 BOM and UTF-16 BOM that Windows PowerShell 5.1 `>` writes, and refuses any other encoding with the file path in its message. `scan` finds the installed quality-guard from it. Stop if quality-guard is missing or the scan fails. When the Claude list shows it disabled or absent, the scan error ends with the one command to run, `claude plugin enable <id>` or `claude plugin install quality-guard@<marketplace>`: report that command verbatim for the user or dispatcher to run, and never enable or install the plugin yourself. Never guess a cache path. The scan covers the whole repository, since a changed-files-only scan would call every export dead. It skips the checkout's gitignored paths, so build output such as `dist-test/` is never judged.

`scan` then applies the repository's own limits in place of the scanner's defaults (width 80, file length 100), and prints what it removed. A `line-length` finding on a file with no formatter width is rejudged at the width the root `.editorconfig` `max_line_length` sets for that file (`off` removes it). Each `--rule-block-on=<rule>:<severity>` flag that a `.github/workflows/*.yml` step running `quality-pr-gate.mjs` passes removes that rule's findings below the severity; comment lines are ignored. The gate's global `--block-on` is not applied. The scan also honors excludePaths from the repository's .quality-guard.json, the same setting the CI gate uses, so both judge one scope. Never pass gate flags to `scan`: it takes only `--client`, `--registry`, `--root` (the repository), and `--out`, and reads the rest from the repository.

Structural rules cover each whole changed file, including pre-PR content. Line-level rules (`line-length`, comment rules) cover only added lines. `violations` numbers the in-scope ones S1..Sn.

## 5. Plan, investigate, verify, judge, merge

Follow the plan/investigate/judge split in `standards/model-routing.md`. In Claude Code, use the Agent tool at each stage's model and effort. In Codex, use the `dod_guard_*` agents in `.codex/agents/`. If they are missing, spawn an explorer with the full definition from `<plugin-root>/agents/` and record the stage as "requested, not pinned".

Every stage gets one brief: PR number and URL, base and head SHAs, slots file, diff path, violations file, PBI criteria and sub-issues verbatim, and the governing AGENTS.md and CLAUDE.md paths.

### Plan

One foreground `dod-guard:read-standard` planner returns a JSON array with one entry per slot, copying slot ids exactly. Each entry has `slot` and either `questions` or `excluded`, never both.

- A question has `id` (unique across lenses), `lens`, `question`, `files`, and the targeted risk.
- A question is neutral. It asks what the code, test or document shows and names no suspected defect, expected answer or verdict. The targeted risk names the failure the question probes, never a conclusion about it.
- An exclusion is one object, `"excluded": { "lens": "review-pr-hygiene", "reason": "..." }`, never an array.
- The lenses are `review-pr-feature` (F), `review-pr-design` (D), `review-pr-reliability` (R), and `review-pr-hygiene` (H). Write each in `lens` as shown. The build also accepts the `dod-guard:` prefix the Agent tool takes and reads it as the bare name; it refuses any other name. Each gets at least one question or exclusion.
- For a file slot with in-scope violations, add scanner check questions with a `scanner` array of the S ids covered. They ask whether the violation shows at the reviewed head, whether the path is generated or excluded, and whether the rule's own condition holds. List only S ids from that slot's file. The build refuses a question whose `scanner` is not an array of S ids, sits in a slot that is not a file slot, or names an unknown S id or one from another file. Put each covered violation's rule, line, and message text in the question itself, so an investigator never needs the scanner output.

### Investigate

Cut the saved plan into batch files:

```
node "<skill-dir>/scripts/review-findings.mjs" batches --plan=<plan.json> --head=<full 40-character head SHA> --out-dir=<batches-dir>
```

The command first checks the plan's shape and refuses a malformed entry before it writes any batch file, so a bad plan fails before any investigator runs. It then skips exclusions, keeps each slot's questions together, caps a batch at eight questions, and stamps every batch file with the plan hash and the head. Run one `dod-guard:stage-cheap` investigator per batch (`dod_guard_stage_cheap` in Codex) in waves of at most 10, each wave dispatched in one message so its batches run in parallel. Before each wave run `node "<skill-dir>/scripts/review-findings.mjs" pending --plan=<plan.json> --head=<full 40-character head SHA> --answers-dir=<answers-dir>`, which prints the `done` and `pending` batches from the answers files on disk, and dispatch at most 10 of the `pending` ones. When `pending` is empty, go on to Verify. A batch whose file is missing, truncated, stamped for another plan or head, or short of an answer is pending, so a resumed owner never reruns a finished batch and never trusts a file that is not whole. Dispatch them in the foreground and wait for every report; never in the background. Investigators write their own files because the main thread would otherwise retype every answer. Each brief follows "Stage brief" in `standards/model-routing.md`: its first line is `Read <plugin-root>/skills/review-pr/SKILL.md, then follow only #### Investigator batch.`, then it names the batch file, the answers file `<answers-dir>/<batch>.json`, the head SHA and the checkout path, and asks for the answers file path and the answer counts as the evidence to return.

#### Investigator batch

Read the batch file. For each question, read the files it names and whatever else you need. Write one file, the answers file your brief names, and no other file. Edit nothing in the checkout, make no Git or provider change, and run no command that writes. The file is a JSON object with `planHash`, `headSha` and `batch` copied from the batch file and an `answers` array with one entry per question: `{ "slot", "id", "status": "answered", "path", "line", "fact" }` with the path and line you read and the fact found there, or `{ "slot", "id", "status": "unanswered", "searched" }` when the repository does not answer it, naming what you searched. Give no verdict, severity or fix. Return the answers file path and the counts of answered and unanswered entries, and nothing else.

### Verify

Merge and check the answers files, then check the checkout:

```
node "<skill-dir>/scripts/review-findings.mjs" answers --plan=<plan.json> --head=<full 40-character head SHA> --answers-dir=<answers-dir> --out=<answers.json>
git status --porcelain
```

`answers` refuses a missing, unreadable, stale or incomplete file and lists every problem. `git status --porcelain` must print nothing, and the answers directory must hold only the batch answers files. Otherwise stop and name the path, because an investigator wrote outside its file.

Then check every answer under the cheap-output rule in `standards/model-routing.md`, with the reviewed head as accepted head. Send a failed batch back once to the same agent with the exact gap and the same batch and answers paths, and rerun `answers`. On a second failure, rerun it once on `dod-guard:stage-standard` with the failure record, per "Escalation". On a third failure of the same check, stop and name the batch. When the plan changes, its hash changes: cut new batches and rerun the investigators, because `answers` refuses every old file.

Save the plan with a status per question: `verified`, `repaired` (verified after the one repair), or `unanswered` (the repo does not answer it). Saving statuses does not change the plan hash.

### Judge

You, the owner, dispatch the four lens reviewers yourself, each at its agent's standard tier whatever your own tier is, because no other thread holds this stage. Dispatch them at once in the foreground (never in the background): a child's reply goes to the thread that dispatched it, so a background reply would reach your dispatcher and leave you waiting. Save each result to `<scratch>/judge-<lens>.json` as it arrives. A valid file is a JSON object whose `reviewer` is that lens, with `rulings` and `findings` arrays. Each judge brief is the shared brief plus, for each slot assigned to its lens, only the slot id, each question's id, text and status or the exclusion's lens and reason, and the path of `<answers.json>`, which the judge reads. A slot belongs to a lens when it has a question or exclusion naming it. The brief holds no owner conclusion, suspected defect, severity guess, earlier finding or other reviewer's output. A judge that returns one of those as a finding gets the one correction request below.

- Paste this result shape into every judge brief and set `reviewer` to that lens: `{"reviewer":"review-pr-feature","rulings":[{"slot":"criterion:1","status":"FINDING","evidence":"..."}],"findings":[{"slot":"criterion:1","severity":"MAJOR","file":"src/a.mjs","line":12,"problem":"...","impact":"...","requirement":"...","correction":"...","rootCause":"...","evidence":"..."}]}`. A finding without all ten fields is refused.
- Each returns `{ reviewer, rulings, findings }`: one ruling `{ slot, status, evidence }` per assigned
  slot, status `VERIFIED` or `FINDING`, and findings with severity `BLOCKER`, `MAJOR`, or `MINOR`. Each
  finding names its `slot`, one assigned to that lens and ruled `FINDING`. Every `FINDING` ruling has at
  least one finding naming its slot. Build refuses a finding that names no slot, an unassigned slot, or a
  slot ruled `VERIFIED`, and a `FINDING` ruling no finding names.
- Settle each `unanswered` question only from the files it names, and read no other file for it. Record the answer in that slot's ruling evidence, or report the gap as a finding. Never count one as passing, and change no plan status after dispatch. Report an exclusion as a finding when its reason fails.
- On malformed JSON, send one correction request in the exact format, as a fresh foreground dispatch of the same lens with the same brief, the quoted refusal, and the path of the file that holds its previous result. Never resume an earlier judge: its reply would go to your dispatcher. A finding that lacks a field is a format failure too: `candidates` refuses it and names the reviewer and the missing fields, so quote that error in the one correction request. On a second failure, stop and name the reviewer. Never escalate a format failure to another tier: the review posts once, so a missing angle cannot be added later.

Assemble the four `judge-<lens>.json` files into one JSON array in `results.json`.

### Merge

```
node "<skill-dir>/scripts/review-findings.mjs" candidates --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --answers=<answers.json> --out=<candidates.json>
```

`candidates` numbers judged findings J1..Jn. One foreground `dod-guard:read-standard` pass (`dod_guard_read_standard` in Codex) reads that file and the plan and returns the merge JSON: `{ "groups": [{ "members": ["J1"], "representative": "J1" }], "scanner": [{ "ids": ["S1"], "status": "KEEP" }] }`.

- Put every J id in exactly one group. A group needs at least one member. Group only findings citing the same defect in the same file. The representative is a member.
- Put every S id in exactly one scanner ruling. Use KEEP unless `not-at-head`, `excluded-path`, or `rule-misfire` holds and a verified or repaired scanner question listing that S id shows it. A DROP adds `"reason"` and `"answer": "<question id>"`. A ruling needs at least one id. A KEEP carries no `reason` or `answer`; the build refuses one that does.
- Set no severity. "Pre-existing" or "unchanged at base" is never a reason to drop.

With no finding and no violation, write `{ "groups": [], "scanner": [] }` and skip the pass. If the build refuses the output, send one correction request with its exact error. On a second refusal, stop and name the merge pass. Never escalate the tier.

## 6. Build and post

```
node "<skill-dir>/scripts/review-findings.mjs" build --head=<full 40-character head SHA> --scan=<scan.json> --diff=<unified0.diff> --pbi=<pbi.json> --sub-issues=<sub-issues.json> --plan=<plan.json> --results=<results.json> --merge=<merge.json> --answers=<answers.json> --out=<payload.json> --scanner-comments-out=<scanner-comments.json>
gh api --method POST "repos/{owner}/{repo}/pulls/{n}/reviews" --input <payload.json>
```

`build` regenerates ids and slots from its own inputs, validates the plan, results, and merge file, and prints the recommendation and severity counts. Scanner findings are summarized per file in the body and inline comments (counts by severity and rule, the first five by line), under a fixed budget. When anything was summarized, `build` also writes the full kept-violation list to `<scanner-comments.json>`, a JSON array of `{ "body": ... }` parts that each start with a `<!-- dod-guard:review-pr-scanner head=<sha> part=<i>/<n> -->` marker; an empty array means nothing was summarized. Dropped scanner findings are listed in a collapsed block as counts and S id ranges per file, rule, and cited answer, with cited question text shortened, under a fixed 12000-character budget; files past it are counted in one overflow line. If the body would still pass 65536 characters, it refuses: shorten question text in the saved plan and rebuild.

BLOCKER and MAJOR findings are inline comments, each with a `GH-<id>` that the label step appends to the comment body after the post. Each comment sits on a line of the finding's own file: the nearest line the diff adds (side `RIGHT`), or, for a file the pull request only trims, the nearest line it removes (side `LEFT`, numbered in the base file). A comment that moved ends with a `Cited location` note that names the line the finding cited. A judged finding in a file the diff does not touch moves to the first added line of the diff, else its first removed line. When no diff line can hold a BLOCKER or MAJOR comment, `build` refuses, names those findings, and writes no payload: nothing was posted, so stop and report the cited locations. Every BLOCKER and MAJOR finding gets its own thread and `GH-<id>`. MINOR findings go in "Minor notes" in the body. A file's scanner findings are MAJOR when any is `high`, else MINOR. Any BLOCKER gives `BLOCK`, else any MAJOR gives `REQUEST_CHANGES`, else `APPROVE`. The body carries the marker `<!-- dod-guard:review-pr head=<sha> recommendation=<REC> -->` that step 2 detects.

Reread the PR head with `gh pr view <number> --json headRefOid` (no `--jq`). If it differs from the PR head SHA of step 1, stop and name both SHAs; report that the user can ask for a review of the new head. Post the payload as one review with event `COMMENT`. A post is ambiguous when it returns a 5xx status, times out, or returns a body you cannot read, because the review may exist even though the call failed. After any failed or ambiguous post, rerun step 2 before any retry and act on its result:

- `found: false`: post the same payload once more.
- `found: true` with `headSha` equal to the reviewed head: that review is the one you posted. Do not post. Continue at "Post the scanner comment parts" below with its `reviewId`, then step 7.
- `found: true` with any other `headSha`: stop, as step 2 says.

Never post a second review.

### Post the scanner comment parts

Run this after every path that ends with a posted review: a fresh post and the `found: true` retry above. It does nothing when `<scanner-comments.json>` is an empty array. If the file is gone, rerun `build` with the same inputs; the parts depend only on those inputs and the head.

```
gh api --paginate --slurp "repos/{owner}/{repo}/issues/{n}/comments?per_page=100"
gh api --method POST "repos/{owner}/{repo}/issues/{n}/comments" --input <part.json>
```

Save the listing, then post each part of `<scanner-comments.json>` in order as its own comment, where `<part.json>` holds one `{ "body": ... }` element. Skip a part whose `head` and `part` marker already appears in a listed comment, so no part is posted twice. After a failed or ambiguous part post, list the comments again and post only the parts still missing. If a part still fails, stop and report the missing part numbers: the review stands, and the body names comments that are not yet posted.

### Label the posted comments

Run this after every path that ends with a posted review, after the scanner comment parts: a fresh post and the `found: true` retry above. A comment's `GH-<id>` is its own id, which exists only after the post, so each inline comment is edited to end with it and the id that step 7 reports is also visible on GitHub.

```
gh api --paginate --slurp "repos/{owner}/{repo}/pulls/{n}/comments?per_page=100"
node "<skill-dir>/scripts/review-findings.mjs" label --review-id=<posted id> --comments=<comments.json> --out=<edits.json>
gh api --method PATCH "repos/{owner}/{repo}/pulls/comments/{id}" --input <edit.json>
```

Save the listing, run `label`, then PATCH each element of `<edits.json>`, where `<edit.json>` holds that element's `{ "body": ... }` and `{id}` is its `id`. The command skips a reply, a comment of another review, and a comment that already ends with its own id, so after a failed or ambiguous PATCH, list the comments again and run `label` again: it returns only the edits still missing. If a PATCH still fails, stop and report the comment ids that lack the visible id: the review stands.

## 7. Report

```
node "<skill-dir>/scripts/review-findings.mjs" report --review-id=<posted id> --comments=<comments.json>
```

Save the PR's review comments first. Report the PR, head SHA, PBI, `Recommendation`, review URL, and each finding as `GH-<id>`, severity, and file:line. Callers pass the GH ids to `dod-guard:fix-pr-review`.