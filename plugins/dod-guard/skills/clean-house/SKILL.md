---
name: clean-house
description: Hunt duplicate and obsolete implementations with git archaeology, then delete them once the user approves. Use when the user says "clean house", asks you to "dedupe", asks to "clean up old versions", asks to "remove dead implementations", asks to "consolidate duplicates", asks to "debloat", asks you to "find stale code", or asks "what's redundant here". Use it too when you find v1 and v2 or old and new variants of one thing, when a dead-symbol scan flags unreachable code, or when a duplication report comes back high.
---

# Clean house

Read and apply `standards/working-defaults.md`; stricter rules here win.

The deliverable is a deletion of the dead side of a superseded pair. Say up front this is an aggressive cleanup where nothing is sacred. Backwards compatibility alone never keeps a file; only a named live consumer does. Once evidence is in and the user approves, delete by default: git history is the safety net.

Skip published libraries and SDKs (deprecated exports may have unseen consumers). Skip pairs where one side is a facade over the other.

## Local deletion exception

Before any archaeology, run `git status --short` and report every pending path. Preserve the path or stop if it holds secrets, unapproved destructive intent, unrelated work, or changes inseparable from the deletion. `git rm <path>` covers only user-approved items, never unrelated dirty changes.

## Tooling

Git plus repo-wide text search is the floor. `mcp__code-review-graph__refactor_tool` with `mode="dead_code"`, `mcp__code-review-graph__get_impact_radius_tool`, and `jscpd` are optional. Call graph tools as MCP tools, never from a shell.

The shell may be PowerShell, Git Bash, or cmd.exe, without grep, head, tail, uniq, or POSIX sort. Use `rg` for every scan, file names included, with double quotes. Never pipe into grep, head, tail, uniq, or a pager (it hangs). Narrow git output with `-n`, `--author`, `--format`, `--diff-filter`. `rg --files` prints native separators, so match one path segment. `rg` globs are case sensitive and skip dotfiles.

## Stage 1: candidate pairs

A candidate pairs the older thing with its replacement; later stages run per pair. Use at least two independent signals:

- `rg --files | rg -i "[-_](v[0-9]|old|new|legacy|copy|compat|shim|deprecated|bak)\b"`
- `rg --files | rg -i "^(old|legacy|compat|shims|deprecated|v[0-9])$|[\\/](old|legacy|compat|shims|deprecated|v[0-9])[\\/]"`
- `rg -ln "_v[0-9]|[a-z](V[0-9]|Legacy|Compat|Shim)\b" -g "*.{ts,tsx,js,jsx,py,rs,go,cs,rb,java,kt,swift}"`
- One symbol defined twice, per suspected name: `rg -n "(function|class|const|def|fn|type) +shipRate\b"`
- `jscpd` output.
- Web projects: route registrations grouped by URL path (`router.get(`, `@Get(`, `@app.route(`). One path under two prefixes or version segments is a pair.
- Barrel files forwarding gone things (`export .* from`, `__all__`, `pub use`).

Count each name pattern's output. If it matches a large share of the repo, it measures naming convention; drop it and say so.

State a confidence and evidence per pair. Strong: one side unreferenced, the other tested, one author wrote both. Fair: evidence one way with a gap. Weak: anything less. Only a Strong pair, or a Fair pair whose gap you name in one sentence (which evidence is missing), goes into the Stage 4 list, and that sentence is repeated beside the pair there. A Fair pair with no named gap counts as Weak. Report a Weak pair in one line, stop, and never delete it.

## Stage 2: dating

- Creation commit: `git log --diff-filter=A --format="%h %ad %s" --date=short -- <path>`. The last line is oldest. Never use `--follow`: single pathspec only, unreliable across renames.
- Commits after the newer side existed: `git log --format="%h %ad %s" --date=short --since=<newer-side-creation-date> -- <path>`
- Staleness: `git log -n 1 --format="%h %ad %s" --date=short -- <path>`
- If the older side has the newer commits, the pair may be inverted (an abandoned rewrite). Check which side is imported, tested, and in the deployed build first. Deleting a live implementation is the worst outcome.
- Authorship: `git shortlog -sn HEAD -- <path>`. Always pass a revision, or it reads stdin. Run it over `HEAD` with no path first; if one name owns the repo, drop the signal and say so.
- Drift: `git diff --no-index <older> <newer>` (exit 1 on a difference is normal).

Classify each commit the older side took after the newer side existed. Fixes to shared behavior get ported to the newer side first. Changes specific to the dying interface die with it. Never assume a rescue is owed.

Port one change at a time: port, run the newer side's tests, commit, repeat. When moving tests, break the covered behavior to confirm each moved test fails.

## Stage 3: prove removal safe

Sweep the whole repo for each dying name and read hits in source, tests, config, docs, and build scripts. Report each live reference, never an unmeasured absence.

- First pass, no other filter, so extensionless build scripts are reached: `rg -n --hidden -g "!.git" "<symbol>"`
- Narrowing later: `rg -n --hidden -g "!.git" -g "Makefile*" -g "Dockerfile*" -g "*.yml" -g "*.toml" "<symbol>"`
- Sweep the stem too, with no slash, since importers name the file: `rg -n --hidden -g "!.git" "<file-stem>"`

A live reference is usually work: if the newer side offers the same behavior, update the referencing site and list that edit beside the deletion it unblocks. A reference blocks only when nothing can replace it. Four blockers: a package this repo publishes exports the name; production config points at it and cannot change this pass; a route or endpoint still takes live traffic (no sweep shows these three); user-relied-upon docs describe it (update docs first).

Confirm the replacement has tests: `rg --files -g "*shipping-rate*" -g "*rates*" -g "*.{test,spec}.*"` (adapt names). If it has none, port tests first or stop and report.

Confirm with impact radius and `dead_code` if available, else trace the call path by hand. Dependencies whose only consumer is the dying side (sweep package names) join the batch.

## Stage 4: approval and delete

Show the exact list of files, data files, and orphaned dependencies, and wait. Give each item's superseding file, creation gap, ported fixes, and reference count.

Delete only what the user approves. A partial yes binds, and a named live consumer keeps its item. If new dead files appear or the plan proves wrong, return with a corrected list; never fold new items into an approved run.

- Never delete anything the approval list did not name, including tests, fixtures, data, or dependencies.
- Before the first `git rm`, run `git status --short` again. If the tree holds changes unrelated to the approved list, stop and report them; do not delete around them. This tightens the "Local deletion exception".
- Commit the deletion on its own, together with the approved orphaned-dependency and lockfile changes and nothing else, so one `git revert <deletion-commit>` undoes the whole batch. Ported changes are earlier, separate commits.

- Delete whole files with `git rm <path>`; never empty a file and leave it. Delete tests, fixtures, mocks, and data that covered only the dying side.
- Remove an orphaned dependency with the project's package manager (`npm remove`, `cargo remove`, `pip uninstall`).
- Recover a wrong deletion before commit with `git checkout HEAD -- <path>`. After commit, run `git log -n 1 --diff-filter=D --format=%h -- <path>`, then `git checkout <hash>~1 -- <path>`. Use `~1`, never `^`.

## After deleting

Run the build, full test suite, and linter (it catches leftover imports). Re-run the stage 3 sweep for removed names. `rg <symbol>` exit 1 is gone, 0 is a surviving reference, 2 is a failed search.

If the build, tests, or linter fail, restore only the file named in the error with the recovery commands in Stage 4, add it to the report as a live consumer, and do not patch around the failure. If the error names no file, restore nothing: report the failing output and the deleted paths, and stop. `git revert` of the deletion commit is the all-or-nothing undo, not the per-file remedy.

Report what you deleted, kept and why, ported, weak pairs left alone, and any lesson.
