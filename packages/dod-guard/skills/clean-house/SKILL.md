---
name: clean-house
description: Hunt duplicate and obsolete implementations with git archaeology, then delete them once the user approves. Use when the user says "clean house", asks you to "dedupe", asks to "clean up old versions", asks to "remove dead implementations", asks to "consolidate duplicates", asks to "debloat", asks you to "find stale code", or asks "what's redundant here". Use it too when you find v1 and v2 or old and new variants of one thing, when a dead-symbol scan flags unreachable code, or when a duplication report comes back high.
argument-hint: [path or component to sweep]
---

# Clean house

Your product is a deletion. You find pairs where one implementation
superseded another. You decide from git history which side is dead. You
rescue work that landed on the dead side by mistake. Then you get approval
and delete.

Say at the start that you are running an aggressive cleanup and that
nothing is sacred. The user should know the default before you start.

Backwards compatibility alone never saves a file. Keep it only when
somebody names a live consumer. Git history is the safety net, so once
the evidence is in, deletion is the default answer.

Two repositories are out of scope. Skip a published library or SDK. A
deprecated export there may have consumers you cannot see. Skip a pair
that turns out to be a facade over an implementation. That is one design,
not two.

## Ground rules

Git and a repo-wide text search are the whole floor. Two extras help when
the project has them, and neither is required.

- `mcp__code-review-graph__refactor_tool` with `mode="dead_code"` names
  symbols nothing reaches.
- `mcp__code-review-graph__get_impact_radius_tool` answers the call-path
  question for one symbol.
- `jscpd` measures copy-paste.

Those two graph entries are MCP tools. Call them as tools. They are not
shell commands and they fail in a shell.

Every command below runs on the user's machine, which may be Windows.
There the shell is cmd.exe, which has no `grep`, `head`, `tail`, `uniq`,
POSIX `sort`, or `$(...)` substitution. Its `find` searches file contents,
not names. It has no single-quote grouping, so `'...'` makes it look for a
program with that name.

So use `rg` for every scan, including scans over file names. Quote with
double quotes. Never pipe into `grep`, `head`, `tail`, or `uniq`. To narrow
git output, use git's own flags such as `-n`, `--author`, `--format`, and
`--diff-filter`.

Two ripgrep traps. `rg --files` prints the native path separator, so a
pattern holding a forward slash matches nothing on Windows. Match one path
segment instead. Ripgrep globs are case sensitive and skip dotfiles, and
`*.Makefile` never matches a file called `Makefile`.

## Stage 1, collect candidate pairs

A candidate is a pair. Name the older thing and the thing that replaced it.
Every later stage runs per pair.

Gather from at least two independent signals. Start with the two that need
nothing but git and ripgrep.

```
rg --files | rg -i "[-_](v[0-9]|old|new|legacy|copy|compat|shim|deprecated|bak)\b"
```

```
rg --files | rg -i "^(old|legacy|compat|shims|deprecated|v[0-9])$|[\\/](old|legacy|compat|shims|deprecated|v[0-9])[\\/]"
```

```
rg -ln "_v[0-9]|[a-z](V[0-9]|Legacy|Compat|Shim)\b" -g "*.{ts,tsx,js,jsx,py,rs,go,cs,rb}"
```

```
rg -n "(function|class|const|def|fn|type) +shipRate\b"
```

The first names files whose names admit a successor. The second names
whole directories that read as obsolete, matching one path segment so it
works on either separator. The third finds two implementations living in
one file, which no filename scan reaches. The fourth finds one symbol
defined in two places, so feed it names you already suspect.

On a web project, add the route scan. Two handlers on one URL path is a
pair even when both filenames look clean.

```
rg -n "(router|app)\.(get|post|put|patch|delete)\(|@(Get|Post|Put|Delete)\(" -g "*.{ts,js,py,rb,go}"
```

```
rg --files -g "route.{ts,js}" -g "handler.{ts,js}"
```

Group the hits by URL path. The same path under two prefixes, or under two
version segments, is a candidate pair.

Also look for a barrel file still re-exporting something that is gone.

```
rg -n "^export .* from ['\"]" -g "index.{ts,js}"
```

When the project has jscpd, add another signal:

```
npx jscpd src --min-tokens 50 --silent
```

That prints one prose line on stdout, of the form `Found 31 exact clones
with 233(2.97%) duplicated lines in 49 (1 formats) files.` Read the
percentage off that line. It writes no report file, and it prints no JSON.

Test a name pattern before you trust it. Run it, then count the lines it
printed. A pattern that names a large share of the repository is measuring
the naming convention, not decay. Drop it and say so.

Never pipe a long result into a pager. `less` and `more` wait for a
keypress that never comes, and the session hangs.

Give every pair a stated confidence and say what earned it. Strong means
one side is unreferenced, the other has tests, and one author wrote both.
Fair means the evidence points one way with a gap in it. Weak means
anything less. Report weak pairs in one line each and investigate no
further.

## Stage 2, date each pair

Find the creation commit of each side. The last line of this output is the
oldest entry.

```
git log --diff-filter=A --format="%h %ad %s" --date=short -- src/pricing/shipping-rate.ts
```

Do not add `--follow`. Git documents it as working with exactly one
pathspec, and it is unreliable across renames.

Now ask whether the older side kept taking work after the newer side
existed. Pass the newer side's creation date.

```
git log --format="%h %ad %s" --date=short --since=2025-11-04 -- src/pricing/shipping-rate.ts
```

For staleness, read the last commit that touched each side.

```
git log -n 1 --format="%h %ad %s" --date=short -- src/pricing/rates.ts
```

Read that result carefully, because it can invert the pair. When the older
side holds the more recent commits, the newer side may be the abandoned
one. Somebody started a rewrite and dropped it. Check three things before
you call the older side dead. Which side does the codebase import. Which
side has tests. Which side does the deployed build include. Deleting
a live implementation because a dead rewrite has a later creation date is
the worst outcome this skill can produce.

To ask whether one author owns the file, always pass a revision.

```
git shortlog -sn HEAD -- src/pricing/rates.ts
```

Without a revision range `git shortlog -sn` reads standard input. In an
agent shell that returns nothing and exits 0, which reports no dominant
author for every repository.

One author across both sides raises confidence, because one person
rewriting their own work rarely means two live designs. That only counts
where authorship discriminates. Run the same command over `HEAD` with no
path first. If one name owns the whole repository, this signal says
nothing here, so drop it and say so.

To see how far the two sides drifted, diff them directly.

```
git diff --no-index src/pricing/shipping-rate.ts src/pricing/rates.ts
```

`--no-index` is load-bearing. Without it git reads both paths as pathspecs
and diffs the working tree against the index, which answers another
question entirely. It exits 1 when the files differ. That is the normal
result, not an error.

Every commit the older side took after the newer side existed is a
decision. Classify each one. A change that fixes shared behavior belongs in
the newer side, so port it first. A change specific to the dying interface
dies with it. Check which kind it is before you move anything. Never assume
a rescue is owed.

Move every belonging change in this order, one at a time. Port it. Run the
newer side's tests. Commit. Only then move to the next one. Porting the
whole set and deleting before you run anything hides a change that does
not compile against the new interface. By then the source is gone.

If test cases have to move from the dying file onto its replacement, hand
that off. Invoke `/dod-guard:adversarial-workflow` and tell it to start at
phase 2, the test audit, over the merged test file.

## Stage 3, prove removal is safe

Nothing goes while a reference still points at it. Sweep the whole
repository for each dying name.

```
rg -n --hidden -g "!.git" "shipRate"
```

`--hidden` is what reaches `.env` and other dotfiles. Passing no `-g`
filter is what reaches `Makefile`, `Dockerfile`, and every other
extensionless build script. Add glob filters only to narrow a second pass,
and write them to match real names.

```
rg -n --hidden -g "!.git" -g "Makefile*" -g "Dockerfile*" -g "*.yml" -g "*.toml" "shipRate"
```

Importers usually name the file, not the symbol. Sweep the file stem as
one segment, with no slash in the pattern.

```
rg -n --hidden -g "!.git" "shipping-rate"
```

Read the hits across source, tests, config, docs, and build scripts. Report
each live reference you find. Never report absence you did not measure.

A live reference is usually work, not a wall. Where the newer side offers
the same behavior, update the referencing site to call it. List that edit
in the plan beside the deletion it unblocks. A reference only blocks
when nothing can replace it.

Four kinds do block, and no repo-wide sweep can see the first three.

1. The dying name is exported from a package this repository publishes.
   Somebody outside can import it, and your search cannot reach them.
2. Production configuration points at it and you cannot change that
   configuration in this pass.
3. A route or endpoint still takes live traffic.
4. Documentation users rely on describes it. Update the documentation
   first, then delete.

Confirm the replacement carries tests before you delete the tested side.

```
rg --files -g "*shipping-rate*" -g "*rates*" -g "*.{test,spec}.*"
```

Deleting a tested implementation in favour of an untested one trades
working code for a guess. When the survivor has no tests, port the tests
first or stop and report it.

When code-review-graph is available, confirm with
`mcp__code-review-graph__get_impact_radius_tool` on the dying symbol, and
with `mcp__code-review-graph__refactor_tool` at `mode="dead_code"`.

Without it, trace the call path by hand. Find where the application wires
things up, then follow the chain from there to the dying name.

```
rg -n "registerRoutes|app\.use|Router\(\)|createRouter|new Server" -g "*.{ts,js,py,rb,go}"
```

Last, list dependencies whose only consumer is the dying side. Run the same
sweep against the package name. A dependency left with no consumer goes in
the same batch.

## Stage 4, ask, then delete

Show the exact list and wait. Delete only what the user approves.

```
Ready to delete, 3 items:

1. src/pricing/shipping-rate.ts
   Superseded by src/pricing/rates.ts, created 3 months later.
   2 later fixes ported already. 0 references outside its own test.
2. src/pricing/legacy-zone-table.json
   Read only by item 1. No other reference.
3. dependency "zone-lookup" in package.json
   Only import was item 1.

Delete all three?

User: yes to 1 and 2, leave the dependency, our build script shells out to it

Deleting items 1 and 2. Keeping "zone-lookup", live consumer named.
```

A partial yes binds. Delete the approved items and nothing else.

Anything the user did not see in that list does not go this pass. If the
migration turns up another dead file, or shows the plan was wrong, come
back to the user with a corrected list. Never fold a new item into a run
that was already approved.

Delete whole files. Never empty a file and leave it in place.

```
git rm src/pricing/shipping-rate.ts
```

Delete the test files that only covered the dying side, along with its
fixtures, mocks, and test data. Those hits appear in your stage 3 sweep
and would otherwise read as live references that block the removal.

Remove a dependency whose only consumer just went.

```
npm remove zone-lookup
```

If a deletion turns out wrong, bring the file back from the last commit
that held it.

```
git checkout HEAD~1 -- src/pricing/shipping-rate.ts
```

## After the delete

Confirm the state you are about to report. Run the project's build. Run its
full test suite. Run its linter, because a removal leaves imports behind
that only the linter names. Then sweep the removed names once more with the
stage 3 command and read the output.

If the work is under a DoD, prove the symbol is gone with command
`rg shipRate` and predicate `exit_code_not: 0`, because ripgrep exits 1
when it matches nothing. To prove a name is absent from build or lint
output instead, run that command and use `output_not_contains`.

Report what you deleted, what you kept and why, what you ported before
deleting, and every weak pair you left alone. When gitevo is running, save
one lesson with `evo_learn` and put the whole lesson in its `content`
argument.
