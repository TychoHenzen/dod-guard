# Conflict triage

When a PBI branch cannot take the default branch because of merge conflicts,
the delivery workflow triages the conflicts instead of stopping. This standard
owns the triage rules. `standards/model-routing.md` owns the tiers, the tier
agents, and how cheap-tier output is verified; this standard names only the
tier each stage uses. `/complete-pr` owns the trigger.

## Trigger and owner

The triage runs when the `/complete-pr` helper stops with `merge_conflict` on
an open pull request whose head is the trusted PBI head. It never runs for a
fork head, a base other than the default branch, or a pull request that is not
open. The thread that runs `/complete-pr` owns the triage. When
`dod-guard:goal-sdlc` runs it, that thread is the `dod-guard:stage-strong`
stage worker, as "Who dispatches" in `standards/model-routing.md` says.

The git steps run through `scripts/conflict-triage.mjs` in the complete-pr
skill directory. Keep its state file and every input file in the caller's
scratch directory, outside the repository:

```text
node <complete-pr-dir>/scripts/conflict-triage.mjs start --state <file> --repository <owner/repository> --pull <number> --trusted-head <sha> --generators <file>
node <complete-pr-dir>/scripts/conflict-triage.mjs verify --state <file> --decisions <file>
node <complete-pr-dir>/scripts/conflict-triage.mjs regen-check --state <file> [--expect-clean]
node <complete-pr-dir>/scripts/conflict-triage.mjs commit --state <file> (--message <text> | --amend)
node <complete-pr-dir>/scripts/conflict-triage.mjs push --state <file>
node <complete-pr-dir>/scripts/conflict-triage.mjs abort --state <file>
node <complete-pr-dir>/scripts/conflict-triage.mjs record --state <file> [--decisions <file>] [--answers <file>] [--verification <file>] [--merge <sha>] [--stop <file>]
```

A result with a `stop` field is a stop under "Stop rules" below. `start`
writes the state file before it merges and saves its own stop there, so
`abort` and `record` work after any `start` stop. `record` takes the stop and
the merge SHA from the state file unless `--stop` or `--merge` names them.

## Preconditions

Before any write, `start` checks that the pull request is open, its head is in
this repository, and its base is the default branch. The checkout must be on
the head branch at the trusted head, the pull request head must equal the
trusted head, no merge may be in progress, and the worktree must be clean.
Commit classified in-scope pending paths first, as `/complete-pr` says. Fetch
the default branch once before `start` so the base commit is local. `start`
records the pull request base SHA as this run's base. During the run, never
fetch the default branch again, rebase, or force-push. Before claiming the
triage, check that no other run holds the same pull request, branch, or stage.

## Generated paths

A path is generated only when the target repository's instructions declare its
generator. Read the declarations from the repository's `AGENTS.md` or
`CLAUDE.md` and pass them to `start` as a JSON list of
`{"paths": ["<glob>"], "command": "<generator command>"}`. `start` requires
the list; pass `[]` when the repository declares no generator. Never infer a
generator from a path name. A conflicted generated path is never hand-merged:
its decision is `regenerate`. A conflicted path that announces it is generated
but matches no declared generator stops the run.

## Stages

`start` merges the recorded base with `git merge --no-ff --no-commit` and
classifies each conflicted path as `source`, `test`, or `generated`. A
`binary`, `modify-delete`, `unclassified`, or `undeclared-generated` path stops
the run before any stage below. A path is `unclassified` when its conflict is
neither a content conflict nor a modify-delete conflict, for example when both
sides deleted or renamed it, or when it is a symlink or submodule entry, which
holds no text to merge.

1. **Plan** (strong tier, `dod-guard:read-strong`). For each conflicted path,
   write questions to a scratch file outside the repository. Each question has
   an id, the paths and hunks, the intent sources to read, and a risk note.
   Intent sources are the PBI acceptance criteria, the pull request body, and
   the commit messages on each side.
2. **Investigate** (cheap tier, `dod-guard:read-cheap`). Only questions that
   need reads beyond the conflicted hunks go to investigators. Each answer
   cites a path and line and gives no verdict. A question the hunks answer
   goes straight to the judge. Verify the answers as
   `standards/model-routing.md` says before the judge reads them.
3. **Judge** (strong tier, `dod-guard:read-strong`). Write one decision per
   path to a decisions file: `take-branch`, `take-base`, `combine`,
   `regenerate`, or `stop`, each with its basis and question ids. A decision
   with no basis is `stop`.
4. **Apply** (cheap tier, `dod-guard:stage-cheap`). Edit only the judged
   source, test, and documentation paths, then stage them. A test expectation
   changes only when the decision cites a clear contract that shows it is
   stale, under the stale-test rule in `standards/working-defaults.md`.
   After the judged paths are staged, run each declared generator whose paths
   conflicted, then run `regen-check`: every change must be a declared output.
   Stage the outputs, run the generator again, and run `regen-check
   --expect-clean`: the second run must change nothing.
5. **Verify** (the owning thread). Run `verify` with the decisions file. It
   checks that no path is unmerged, no conflict marker remains, `git diff
   --check` is clean, and every decision is visible in the staged result.
   Then run `commit`, which records the two-parent merge commit locally, and
   run the target repository's full validation set from its instructions on
   that commit.

Run each stage at its tier as `standards/model-routing.md` says, and name the
stage, tier, model, and effort in every progress message. One repair is
allowed when verification fails and a clear contract shows what is stale:
repair, stage, run `commit --amend`, and verify again. A second failure stops
the run.

## Stop rules

Stop without a push when:

- both sides change the same behavior and no intent source says which wins;
- a path is modified on one side and deleted on the other;
- a binary path conflicts;
- a generated path has no declared generator;
- a judged decision has no basis, or is `stop`;
- verification fails a second time;
- the pull request head or base changes during the run.

On a stop, run `abort`. It runs `git merge --abort` only when `MERGE_HEAD` is
this run's recorded base. Never run `git reset`, `git stash`, `git checkout --`,
or a push to undo work. A local merge commit that `commit` created stays for
diagnosis. Report the paths, the reason, and the decision needed. The remote
pull request head stays unchanged.

## Push provenance

`push` re-reads the pull request immediately before pushing. The head must
equal the trusted head and the base must equal the recorded base. The commit
must have exactly two parents: the trusted head, then the recorded base. It
pushes without force as a fast-forward and reads the remote head back, which
must equal the merge commit. A rejected push stops. Any other push failure is
read back and retried once with the identical command. Any mismatch stops with
the expected and observed SHAs.

## Record

Add one `## Conflict triage` section to the PBI's single `## Implementation
handoff` comment, rendered by `record`. It lists the base SHA, the merge SHA,
each path's decision and basis, the question ids, the investigator answers
used, the verification results, and the stop reason when there is one. Write
no local ledger.

## After a push

After a verified push, `/complete-pr` ends with `conflict-triaged` and does not
merge. The merge commit holds code no reviewer has seen, and the acceptance
matrix is not current at the new head. The PBI re-enters `/submit-draft-pr`
convergence on the new head, then `/review-pr`, and only then `/complete-pr`.
The triage posts no review request to Codex and does not repeat the ready
transition's request.
