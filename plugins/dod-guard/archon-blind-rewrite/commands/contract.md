You write the behavior contract for a blind rewrite of `$INPUTS.target`.

After you finish, the target is deleted and a writer who never sees it builds a
replacement from your contract alone. You are the only session that reads the
original before the audit. Everything you copy into the contract shapes the
replacement toward the old version. Everything you leave out is behavior the
replacement will lose. Hold the line between the two.

Change nothing in the repository. You write exactly two files, both in
`$ARTIFACTS_DIR`.

## 1. Classify the target

Read the target, its callers, its tests, and the repository's AGENTS.md or
CLAUDE.md. Pick one shape:

- `seam`: code whose callers and tests can judge a replacement. The public
  names, signatures and observable results stay; the interior is free.
- `prose`: a document or passage with no test harness. Claims, strength,
  caveats, audience and constraints stay; the wording is free.
- `no-seam`: code with no tests or observable boundary that could judge a
  replacement.
- `dependency-swap`: the request is really to replace a library across its call
  sites, not to rewrite this target.

For `no-seam` and `dependency-swap`, write no files, return the shape with every
other field empty, and stop. The run ends there.

## 2. Find the check command

For a `seam` target, find the repository's own command that exercises the
target: the focused test command first, as AGENTS.md, CLAUDE.md, the package
scripts, a Makefile or the README name it. Return it as one shell command line
that exits non-zero on failure. Invent no command. When none exists, return an
empty string. For `prose`, return a check command only when the repository has
one that covers the document (a docs build or link check); otherwise empty.

## 3. Write the contract

Save it as `$ARTIFACTS_DIR/contract.md`.

For `prose`, read `$PACK_DIR/agents/blind-prose-contract-extractor.md` and
produce the report it defines. Its rules hold in full.

For `seam`, the contract states what the target does, never how:

- Each behavior as one plain sentence: inputs, outputs, errors, side effects,
  ordering or timing a caller can observe, resources it acquires and releases.
- Invariants and caveats, with the condition each holds under.
- Every item tagged `REQUIRED` (a caller, a test, a doc, or the request
  depends on it; cite the path and line) or `OBSERVED` (only the target itself
  shows it). A tie goes to `OBSERVED`. Keep every `OBSERVED` item in the
  contract; the writer must carry it unless a person cut it.
- A `### Verbatim` section: the public names, signatures, error strings,
  serialized keys, exit codes and other boundary text a caller relies on, one
  item per line.

Keep out of a code contract: private names, helper structure, declaration
order, algorithm choice, comments, and any example that would show the old
shape.

## 4. Write the verbatim list

Save `$ARTIFACTS_DIR/verbatim.txt`: the items of the contract's Verbatim section
only, one per line, with no list marker and no heading. The overlap gate exempts
exactly these lines from scoring, so put nothing there that may differ.

## 5. Find the leaks

List every other tracked path that holds a copy or close excerpt of the
target: generated copies, bundles, rendered docs, duplicated sections, quoted
excerpts, changelog entries. The writer is told never to open them.

## 6. Return

- `shape`: from step 1.
- `seam`: one sentence naming the boundary the replacement must keep and who
  depends on it.
- `checks`: from step 2.
- `leak_paths`: from step 5.
- `whitelist`: the public names from the Verbatim section that must keep their
  spelling, comma separated, for the overlap gate.
- `question`: empty, unless two REQUIRED items cannot both hold. Then state the
  conflict, both readings and what each would cost, in plain words for a person
  who has not seen the code. The run pauses for that answer.
