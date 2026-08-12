# Branch Lifecycle Specification

## Purpose

Defines the evolutionary branching workflow itself: marking a point in a
repository's history, branching from that mark to try something, reverting a
failed attempt, keeping a winning one, and finishing the run. The pre-move
safety scan belongs to `gitevo/safety-gate`, the durable message store belongs
to `gitevo/memory-bus`, and lesson export belongs to `gitevo/lesson-export`;
this capability names those seams rather than repeating them.

## Requirements

### Requirement: Init prepares a repository and is idempotent

`evo_init` SHALL create a `.evo/` directory at the repository's top level, add
`.evo/` to the exclude list, and tag HEAD as `evo-root`. Running it again on an
already-initialized repository SHALL succeed rather than fail, and SHALL move
the `evo-root` tag to the current HEAD.

#### Scenario: First init
- **WHEN** `evo_init` runs in a repository with no `.evo/` directory
- **THEN** it creates `.evo/`, excludes it, and tags HEAD as `evo-root`

#### Scenario: Repeated init
- **WHEN** `evo_init` runs again in a repository it already initialized
- **THEN** it succeeds and re-tags `evo-root` at the new HEAD, without failing
  because the directory already exists

### Requirement: Init migrates legacy lesson storage

`evo_init` SHALL migrate any lessons recorded in the legacy JSONL file into the
durable message store, then clear the JSONL file, leaving the store as the
sole record of past lessons afterward.

#### Scenario: Legacy JSONL present
- **WHEN** `evo_init` runs and `.evo/lessons.jsonl` holds legacy lesson entries
- **THEN** those entries are migrated into the durable store and the JSONL file
  is left empty

### Requirement: An uninitialized repository refuses every other operation

Every operation other than `evo_init` SHALL require that `.evo/` already
exists at the repository's top level, and SHALL refuse with a message telling
the caller to run `evo_init` first when it does not.

#### Scenario: Checkpoint before init
- **WHEN** `evo_checkpoint` runs in a repository with no `.evo/` directory
- **THEN** it refuses and tells the caller to run `evo_init` first

### Requirement: Checkpoint marks the current state under a name

`evo_checkpoint` SHALL tag the current state as `evo-<name>` with the given
description, so the state can be resumed by `evo_spawn` or restored by
`evo_abandon`, without disturbing the caller's working tree.

#### Scenario: Checkpoint on a clean tree
- **WHEN** `evo_checkpoint` runs with no uncommitted changes
- **THEN** the current HEAD is tagged `evo-<name>` directly, and no commit is
  created

#### Scenario: Checkpoint on a dirty tree
- **WHEN** `evo_checkpoint` runs with uncommitted changes present
- **THEN** those changes are committed, the resulting commit is tagged
  `evo-<name>`, and the branch is then reset back to the HEAD captured before
  the commit, so the caller's working tree ends up dirty again in the same way
  it started

### Requirement: Spawn branches from a captured checkpoint

`evo_spawn` SHALL create a new branch starting from the commit a named
checkpoint tag points at, and SHALL refuse when the checkpoint does not exist
or the branch name is already taken.

#### Scenario: Spawn from a known checkpoint
- **WHEN** `evo_spawn` runs naming a checkpoint that exists and a branch name
  that does not
- **THEN** a new branch is created at that checkpoint's commit and becomes the
  active branch

#### Scenario: Spawn from an unknown checkpoint
- **WHEN** `evo_spawn` names a checkpoint that has no matching tag
- **THEN** it refuses and lists the checkpoints that do exist

#### Scenario: Spawn onto an existing branch name
- **WHEN** `evo_spawn` names a branch that already exists
- **THEN** it refuses without creating or altering any branch

### Requirement: Abandon reverts to the branch's spawn point

`evo_abandon` SHALL revert the active branch to the checkpoint it was spawned
from, tag the abandoned commit as dead, and record the branch as dead. When
the caller names a specific checkpoint, that checkpoint SHALL be used instead
of the spawn point. When neither is available, the previous commit SHALL be
used.

#### Scenario: Abandon with no checkpoint named
- **WHEN** `evo_abandon` runs on a branch that was spawned from a recorded
  checkpoint, and the caller names no checkpoint
- **THEN** the branch is reset to that spawn checkpoint, not to the commit
  before HEAD

#### Scenario: Abandon naming an explicit checkpoint
- **WHEN** the caller names a checkpoint that exists
- **THEN** the branch is reset to that checkpoint instead of the recorded
  spawn point

#### Scenario: Abandon with no spawn record and no named checkpoint
- **WHEN** the branch has no recorded spawn point and the caller names none
- **THEN** the branch is reset to the commit before HEAD

### Requirement: Adopt merges a branch into the root and refuses a dirty tree

`evo_adopt` SHALL refuse to run while the working tree holds tracked changes,
telling the caller to commit or stash first. On a clean tree it SHALL merge
the named branch into the repository's root branch and tag the result
`evo-adopted`.

#### Scenario: Adopt with tracked changes present
- **WHEN** `evo_adopt` runs while the working tree holds uncommitted tracked
  changes
- **THEN** it refuses and tells the caller to commit or stash first, without
  touching any branch

#### Scenario: Adopt on a clean tree
- **WHEN** `evo_adopt` runs on a clean tree naming a branch that exists
- **THEN** that branch is merged into the root branch and the merge commit is
  tagged `evo-adopted`

### Requirement: Adopt aborts cleanly on a merge conflict

When the merge started by `evo_adopt` cannot complete without conflicts, the
operation SHALL abort the merge before returning, leaving the repository as it
was before the merge attempt, and SHALL report which files conflicted.

#### Scenario: Merge produces conflicts
- **WHEN** merging the named branch into the root branch produces conflicting
  files
- **THEN** the merge is aborted, the repository is left unmerged, and the
  error names the conflicting files so the caller can resolve them manually or
  abandon the branch

### Requirement: Finish adopts the active branch and removes gitevo state

`evo_finish` SHALL merge the active branch into the root branch if it is not
already the root branch, remove every `evo-*` tag, delete every branch other
than the root branch and its conventional siblings, and remove the `.evo/`
directory.

#### Scenario: Finish from an attempt branch
- **WHEN** `evo_finish` runs while an attempt branch is active
- **THEN** that branch is adopted into the root branch, all evo tags are
  removed, side branches are deleted, and `.evo/` no longer exists

#### Scenario: Finish already on the root branch
- **WHEN** `evo_finish` runs while the root branch is already active
- **THEN** no merge is attempted, and the cleanup of tags, side branches, and
  `.evo/` still happens

### Requirement: Listing operations report checkpoints, branches, and progress

`evo_checkpoints` SHALL list every checkpoint tag with its description.
`evo_branches` SHALL list every branch except the root branch and its
conventional siblings. `evo_diff` SHALL show the difference between two named
checkpoints. `evo_summary` SHALL report the active branch, the checkpoint
count, the lesson count, the dead-branch count and names, and whether a branch
has been adopted.

#### Scenario: No checkpoints yet
- **WHEN** `evo_checkpoints` runs before any checkpoint has been created
- **THEN** it reports that no checkpoints were found

#### Scenario: Listing attempt branches
- **WHEN** `evo_branches` runs after one attempt branch was spawned
- **THEN** it lists that branch and omits the root branch and its conventional
  siblings

#### Scenario: Diff between two checkpoints
- **WHEN** `evo_diff` names two checkpoints that both exist
- **THEN** it reports the difference between the commits those checkpoints
  point at

### Requirement: Checkpoint tags follow a fixed naming convention

A checkpoint SHALL be tagged `evo-<name>`. The root checkpoint SHALL be tagged
`evo-root`. An abandoned branch SHALL be tagged `evo-dead-<branch>`. An adopted
merge SHALL be tagged `evo-adopted`.

#### Scenario: Checkpoint tag shape
- **WHEN** `evo_checkpoint` is called with the name `explore-cache`
- **THEN** the resulting tag is `evo-explore-cache`

#### Scenario: Dead branch tag shape
- **WHEN** `evo_abandon` runs on a branch named `try-cache`
- **THEN** the abandoned commit is tagged `evo-dead-try-cache`

### Requirement: Spawn and abandon auto-stash uncommitted work, but resolve the stash differently

Before moving the tree, `evo_spawn` and `evo_abandon` SHALL stash uncommitted
work if any is present, and SHALL refuse to proceed if the stash itself fails.
After spawning, the stash SHALL be popped back onto the new branch, and a
failed pop SHALL be reported to the caller rather than silently dropped. After
abandoning, the stash SHALL be left in place rather than popped, because
reapplying dirty edits on top of a rewind would contradict the rewind.

#### Scenario: Stash push fails
- **WHEN** the auto-stash attempted by `evo_spawn` or `evo_abandon` cannot run
- **THEN** the operation refuses before moving any branch or commit

#### Scenario: Spawn pops the stash
- **WHEN** `evo_spawn` stashed uncommitted work and the new branch is created
- **THEN** the stash is popped back onto the new branch

#### Scenario: Spawn's pop fails
- **WHEN** the stash popped after `evo_spawn` cannot be reapplied
- **THEN** the branch is still created, and the caller is told the changes are
  recoverable with a manual stash pop

#### Scenario: Abandon leaves the stash
- **WHEN** `evo_abandon` stashed uncommitted work before reverting the branch
- **THEN** the stash is left in place after the revert, and the caller is told
  the changes are recoverable with a manual stash pop

### Requirement: Git runs through an argv array, never a shell

Every git invocation SHALL pass its arguments as an argv array to the git
process directly, rather than building a shell command line, so no argument
needs shell escaping.

#### Scenario: Argument holding shell-special characters
- **WHEN** an operation passes a checkpoint description or branch name holding
  characters that a shell would treat specially
- **THEN** git receives that value unchanged as a single argument, and no
  shell interprets it

### Requirement: The `.evo/` directory is ignored at the git level, not via `.gitignore`

Excluding `.evo/` from version control SHALL be done by writing to the git
directory's own exclude file, not by editing the repository's `.gitignore`,
so the working tree carries no gitevo-authored change and no working-tree
checkpoint ever commits gitevo's own state.

#### Scenario: Init excludes .evo
- **WHEN** `evo_init` runs
- **THEN** `.evo/` is added to the git directory's exclude file, and
  `.gitignore` in the working tree is left untouched

#### Scenario: Exclude entry already present
- **WHEN** `evo_init` runs again and the exclude file already lists `.evo/`
- **THEN** no duplicate entry is added
