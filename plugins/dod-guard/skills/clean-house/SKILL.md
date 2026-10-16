---
name: clean-house
description: Hunt duplicate and obsolete implementations with git archaeology, then delete them once the user approves. Use when the user says "clean house", asks you to "dedupe", asks to "clean up old versions", asks to "remove dead implementations", asks to "consolidate duplicates", asks to "debloat", asks you to "find stale code", or asks "what's redundant here". Use it too when you find v1 and v2 or old and new variants of one thing, when a dead-symbol scan flags unreachable code, or when a duplication report comes back high.
---

# Clean house

Say this first: this is an aggressive cleanup, and nothing is sacred. Old code does not earn a place by being old, and backwards compatibility alone never justifies keeping a file. Git history is the safety net.

The product of this skill is a deletion. Find superseded pairs, decide from git history which side is dead, rescue any work stranded on the dead side, get approval, then delete.

Skip two kinds of target:

- A published library or SDK. Deprecated exports may have consumers you cannot see.
- A pair that is really a facade over an implementation.

Read `standards/working-defaults.md` from the plugin root and apply it. Where a rule in this skill is stricter, the stricter rule wins.

## Local deletion exception

The shared defaults forbid destructive changes. This skill has one narrow exception to that rule. `git rm` is allowed only for the exact items the user approves. It does not authorize unrelated dirty changes.

Before any archaeology, run `git status --short`. Report every pending path to the user. Then preserve the path or stop and ask when it is any of these:

- a secret
- work that implies destructive intent the user has not approved
- unrelated work
- a change you cannot separate from the proposed deletion

## Rules that hold in every stage

- Keep a file only when someone names a live consumer. "It might be needed" is not a consumer.
- Search with `rg` alone, including for file names (`rg --files`). Never pipe into `grep`, `head`, `tail`, `uniq`, `less`, or `more`. Narrow with `rg` flags (`-n`, `-i`, `-ln`, `-g "<glob>"`) and with git's own flags (`-n`, `--author`, `--format`, `--diff-filter`).
- Quote with double quotes only, so the same command runs in cmd.exe and PowerShell. Those shells lack the POSIX tools, cmd `find` searches file contents, and cmd has no single-quote grouping.
- Two ripgrep traps. `rg --files` prints native path separators, so match one path segment and never a slash. Globs are case-sensitive and skip dotfiles, so `*.Makefile` does not match `Makefile`.
- Never use `git log --follow`. It takes one pathspec and fails across renames.
- Every `rg <name>` exit code means something: 1 is no match (the goal), 0 is a survivor, 2 is a search failure. Treat 2 as unmeasured, not as clean.

## Stage 1, collect candidate pairs

Use at least two independent signals. Count the hits for every name pattern before you trust it. A pattern that matches a large share of the repo measures naming convention, not duplication. Drop it and say so.

Signals to scan, all with `rg`:

- File names carrying version, old, new, legacy, copy, compat, shim, deprecated, or bak markers (`rg --files --hidden -g "!.git"`, then match the name).
- Directories named like those markers.
- In-file duplicates: symbol suffixes such as `_v2`, `V2`, `Legacy`, `Compat`, `Shim`, across the common source extensions.
- One symbol defined twice. Feed in the names you suspect.
- On web projects, two handlers on one URL. Search for route registrations and group the hits by path. Use the framework's own patterns, for example `app.get(` in Express or `@app.route` in Flask.
- Barrels and re-exports that still forward removed things. Use the language's re-export pattern, for example `export * from` in TypeScript or `from .x import *` in Python.
- Optionally, a copy-paste detector such as `jscpd`.
- Optionally, `mcp__code-review-graph__refactor_tool` with `mode="dead_code"`. Call it as a tool, not through the shell.

Author concentration is a signal only when it discriminates. Run `git shortlog -sn HEAD` with no path first. If one person owns the whole repo, drop the signal and say so.

One author across both sides raises confidence, because one person rewriting their own work rarely means two live designs.

Give every candidate pair a stated confidence and its evidence:

- Strong: one side unreferenced, the other tested, one author.
- Fair: the evidence points one way but has a gap.
- Weak: anything less.

A weak pair gets one line in the report and no further work.

## Stage 2, date each pair

Find which side came first and which side is dead.

- Creation: `git log --diff-filter=A --format="%h %ad %s" --date=short -- <path>`. The last line is the oldest entry, so it is the creation commit.
- Later activity: `git log --format="%h %ad %s" --date=short --since=<date> -- <path>`, where the date is when the newer side appeared.
- Latest touch: `git log -n 1 --format="%h %ad %s" --date=short -- <path>`.
- Authors: `git shortlog -sn HEAD -- <path>`. Always give a revision. Without one, git reads stdin and silently returns nothing in an agent shell.
- Content: `git diff --no-index <a> <b>`. Exit code 1 means the files differ, which is normal. `--no-index` is load-bearing: without it git diffs the working tree against the index, a different question. Run it, because the diff shows what the older side does that the newer side does not.

Guard against inversion. If the older side kept receiving commits after the newer side existed, the newer side may be an abandoned rewrite. Before you call the older side dead, check what the codebase imports, which side has tests, and what the deployed build includes. Deleting a live implementation because a dead rewrite is newer is the worst failure this skill can cause.

Classify each commit the older side took after the newer side existed:

- A fix to shared behavior gets ported to the newer side.
- A change specific to the dying interface dies with it.

Never assume a rescue is owed. Port one commit at a time: port it, run the newer side's tests, commit, then take the next. Never batch-port and then delete.

## Stage 3, prove removal is safe

Do these for each item.

1. Sweep the whole repo for each dying symbol and for its file stem. A stem is one path segment with no slash. Include dotfiles and extensionless build scripts, so use `rg -n --hidden -g "!.git" <name>` with no blanket glob filter on the first pass. Report each live reference you find. Never claim a reference is absent unless you measured it. A clean sweep does not prove there is no external consumer: published exports, production config, and live routes are blockers no repo-wide sweep can see.
2. Optionally call `mcp__code-review-graph__get_impact_radius_tool` for the dying name. Without the MCP tools, trace the call path by hand from the app's wiring (route or service registration) to the dying name. Git and `rg` are the floor.
3. Treat a live reference as work. Repoint the caller to the newer side, and list that edit in the plan beside the deletion it unblocks.
4. Stop on a reference that nothing can replace. The blocking cases are a symbol exported from a package this repo publishes, production configuration you cannot change in this pass, a route or endpoint that still takes live traffic, and documentation users rely on. For documentation, update the docs first, then delete.
5. Confirm the surviving side has tests before you delete the tested side. If it has none, port tests first or stop and report. Port moved tests one at a time, and prove each one live: break the covered behavior and watch the test fail.
6. List dependencies whose only consumer was the dying side. Delete them in the same approved batch through the project's package manager (for example `npm remove`, `cargo remove`, or `pip uninstall`). Also list the test files, fixtures, mocks, and data that only covered the dying side. Sweep the package name now, before deletion, for dependencies whose only consumer is the dying side.

## Stage 4, ask, then delete

Once the evidence is in, deletion is the default answer. Never delete anything the user has not approved in an explicit list shown to them. Show the exact list with per-item evidence, then wait for the reply.

A partial yes binds. Delete only the approved items and keep the rest, recording the stated reason for each.

Never fold a newly discovered item or a changed plan into an approved run. Go back to the user with a corrected list.

A sample list and reply:

```text
1. src/pricing/shipping-rate.ts - Superseded by src/pricing/rates.ts, 2 later fixes ported, 0 references
2. legacy-zone-table.json - Superseded by zone-lookup, 0 later fixes, 0 references
3. dependency zone-client - Only src/pricing/shipping-rate.ts imported it, 0 references

Delete all three?
```

User: "Yes to 1 and 2. Keep the dependency, a build script shells out to it."

Assistant: "Deleting items 1 and 2 only. Keeping zone-client because a build script shells out to it."

When you delete:

- Delete whole files with `git rm <path>`. Never empty a file and leave it.
- Never delete while a reference still points at it.
- Remove the approved dependencies with the package manager.
- Delete the test files, fixtures, mocks, and test data that only covered the dying side. Such hits are not blocking references.

Afterward, run the project's build, its full test suite, and its linter. Then rerun the reference sweep for each removed name, for example `rg -n --hidden -g "!.git" shipRate`, and read the result. Exit code 1 is the goal. For a removed package, also sweep for the package name to check for a consumer you missed.

## Recovery

- Before the commit, restore from `HEAD`: `git checkout HEAD -- <path>`.
- After the commit, find the deleting commit with `git log -n 1 --diff-filter=D --format=%h -- <path>`. Then restore from its parent: `git checkout <hash>~1 -- <path>`. Write `~1`, never the caret form, because cmd.exe eats the caret.

## Report

Finish with:

- what you deleted
- what you kept, and why
- what you ported before deletion
- every weak pair you left alone
- any reusable lesson
