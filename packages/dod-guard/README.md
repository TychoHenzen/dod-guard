# dod-guard

An OpenSpec scenario-coverage tool for Claude Code. It answers one question a
model cannot honestly answer about its own work. Did a real test exercise
this scenario through something a user can reach? Not the agent that wrote
the feature. A real, pre-existing test.

## What it does

- **Scenario-to-test binding** - a scenario in `openspec/specs/*/spec.md`
  counts as covered only when a `// covers:` marker in a test file names it.
  The marker comes from the test file itself. Nothing infers a binding by
  title match
- **Reachability, not just execution** - a bound test that imports a function
  and calls it directly is not the same as a user reaching that function. The
  bound test runs under coverage instrumentation, scoped to its package's
  compiled output, and `cover` checks whether a project-declared entry point
  actually executed
- **Four honest outcomes** - every scenario resolves to one of four states.
  `unwired` means no test binds it. `covered-but-not-integrated` means a bound
  test passed but never reached a declared entry point. `covered-and-integrated`
  means a bound test passed and reached one. `failed` means the bound test
  failed, or no test with that name exists
- **Ratcheted, not a one-shot pass/fail** - `.github/quality/coverage-gate-baseline.json`
  adopts a scenario it has never scored at whatever outcome `cover` finds. It
  fails a run only when a scenario it already scored regresses to a worse
  outcome. Existing debt is allowed. Making it worse is not
- **A generated execution plan** - `steps` reads a change's `tasks.md` and
  writes `openspec/changes/<id>/steps.json`, binding each task's `verify_cmd`
  through `cover` where a `<!-- covers: -->` annotation names a scenario

There is no proof tree, no predicate, and no command a model authors to grade
its own work. The grade comes from whether a named, pre-existing test reached
the code.

## Install

### As a Claude Code plugin (recommended)

```
claude plugin install --from github tychohenzen/dod-guard
```

### As a standalone MCP server

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "dod-guard": {
      "command": "npx",
      "args": ["-y", "dod-guard"],
      "type": "stdio"
    }
  }
}
```

### Via npm global install

```bash
npm install -g dod-guard
```

## MCP server

The server registers **no tools**. Connecting to it over stdio (no CLI
arguments) starts a bare MCP session with nothing to call. All of dod-guard's
functionality - `cover` and `steps` - is a shell CLI, invoked the same binary
by argument rather than through MCP tool calls.

## CLI

The same `dist/bundle.js` binary is both the MCP server and the CLI -
`process.argv.slice(2)` decides which. With no arguments it starts the MCP
stdio server; with arguments it runs a command:

```bash
dod-guard cover [<change-id>] [--all] [--write-baseline] [--cwd=<dir>]
dod-guard steps <change-id> [--cwd=<dir>]
```

`cover` reports each scenario as `covered-and-integrated`,
`covered-but-not-integrated`, `unwired`, or `failed` against the coverage-gate
ratchet baseline. One of `<change-id>` or `--all` is required.
`--write-baseline` needs `--all` - it replaces the whole baseline, and a
change-scoped run only ever sees its own scenarios. `--cwd=<dir>` overrides
the working directory for either command.

`steps` derives `openspec/changes/<id>/steps.json` from that change's own
`tasks.md`, binding each task's `verify_cmd` through `dod-guard cover` where a
`<!-- covers: -->` annotation names a scenario.

Exit codes:

| Command | `0` | Other |
|---|---|---|
| `cover` | no regressions against the baseline | `1` a regression, `3` usage error |
| `steps` | wrote `steps.json` | `3` usage error |

`dod-guard cover <change-id>` scoped to one change exits `0` when that
change's scenarios show no regressions. That is what makes it usable as a
closing gate. `/step-by-step`'s Finishing phase runs it before calling
`openspec archive`.

## Skills

The plugin ships twelve skills.

| Skill | Use it for |
|---|---|
| [`/interview`](#interview) | Pinning down requirements before any implementation task |
| [`/step-by-step`](#step-by-step) | Executing a confirmed multi-step plan one atomic step at a time |
| [`/cheap-step`](#cheap-step) | The same plan, with implementation offloaded to cheap DeepSeek workers |
| [`/ratchet`](#ratchet) | Executing an existing OpenSpec change autonomously, one sub-problem per loop iteration |
| [`/adversarial-workflow`](#adversarial-workflow) | Driving one change through four rounds of hostile review, gated GO/REVISE/STOP |
| [`/clean-house`](#clean-house) | Hunting duplicate and obsolete implementations with git archaeology |
| [`/test-integrity-checker`](#test-integrity-checker) | Auditing tests written to match the implementation instead of a spec |
| [`/blind-rewrite`](#blind-rewrite) | A rewrite that keeps coming back as a renamed variable |
| [`/tighten`](#tighten) | Removing accidental complexity one scanner-ranked target per invocation |
| [`/doc-reconcile`](#doc-reconcile) | Documents that contradict each other |
| [`/skill-debug`](#skill-debug) | A skill that ignored its own steps, debugged from real session transcripts |
| [`/skill-migrate`](#skill-migrate) | Migrating a skill or agent definition to a newer model by blind rewrite |

### `/interview`

Reads the code a change touches. Then questions the user one item at a time
until requirements are confirmed and a written summary is locked in. Runs an
adversarial review of that spec. Writes the resulting scenarios into an
OpenSpec change, and marks how each scenario binds to a test. Never
implements - the output is a change id, handed to an executor skill.

Triggers: any implementation task, feature request, bug fix, or refactor,
before writing code or plans.

### `/step-by-step`

Executes a confirmed multi-step plan by dispatching one fresh subagent per
atomic step. The orchestrator holds only the current step plus a compact
result of the last one. That removes the pressure that makes models batch
steps, skip verification, or wrap up early. Reads and writes
`openspec/changes/<id>/steps.json` - an OpenSpec change id is required. Its
Finishing phase runs `dod-guard cover` and, on a clean result, `openspec
archive`.

Triggers: a plan with 5+ steps, a model starting to batch or cut corners, or
"work through this step by step."

### `/cheap-step`

A delta over `/step-by-step`: everything about splitting the plan, the
session file, staleness checks, and the closing gate is inherited unchanged.
The one substitution is where implementation goes - to the evomcp `solve`
tool (cheap DeepSeek workers) instead of a dispatched host agent. The host
model still writes the spec, still runs verification, and still decides the
verdict.

Triggers: a plan with 5+ steps where implementation should run on the cheap
backend, "cheap step," "offload to deepseek," "delegate the grunt work."

### `/ratchet`

Executes an existing OpenSpec change autonomously, one sub-problem per loop
iteration, re-running the whole change's coverage check every cycle so
earlier work cannot silently break. Needs a confirmed change id - it does not
gather requirements or build the plan; that's `/interview`'s job. Captures
branches with gitevo and persists lessons at the end.

Triggers: interdependent sub-problems, unknown unknowns, real regression
risk, "solve with ratchet," "ratchet this."

### `/adversarial-workflow`

Drives one OpenSpec change through four rounds of hostile review - spec,
tests, implementation, structural cleanup - each closing with a GO/REVISE/STOP
verdict recorded in the change's `design.md`. Reviewers run without the
author's reasoning and must produce findings; "looks good" is not a review.

Triggers: "gate this," "strict quality," "full adversarial pass," a quality
or security concern about multi-step work.

### `/clean-house`

Hunts pairs where one implementation superseded another. Git archaeology
decides which side is dead. Rescues work that landed on the dead side by
mistake, then deletes on approval. Backwards compatibility never saves a
file by default - only a named live consumer does.

Triggers: "clean house," "dedupe," "clean up old versions," "remove dead
implementations," "consolidate duplicates," "debloat."

### `/test-integrity-checker`

Audits a test file for tests written to match the implementation instead of
a specification. It looks for logic mirroring, output blessing, weak
assertions (`toBeDefined`/`toBeTruthy`), mock-everything tests, and missing
negative cases. Then it repairs one file into an oracle backed by a
demonstrated fault.

Triggers: "audit my tests," "are these tests real," "the tests might be
wrong," tests that assert only truthiness, or a mutant that survived.

### `/blind-rewrite`

Deletes the target first. Extracts a contract of what it does, not how it
reads, and hands that contract to an author who never sees the original.
Gates the result against the deleted copy with `overlap-scan.mjs`, which
rejects paraphrase. Covers four shapes: a new interior behind an existing
seam, no seam yet, a dependency swap, and prose with no test harness.

Triggers: "rewrite this properly," "complete rewrite," "no cosmetic changes,"
"swap this library," or a rewrite that came back as a cosmetic edit.

### `/tighten`

An autonomous loop that removes accidental complexity one target per
invocation. Ranks files by structural violations joined against git
return-churn, opens an OpenSpec change scoped to the picked target, and
blind-rewrites it. Two gates must pass: the result has to be different, and
it has to be smaller.

Triggers: "tighten the codebase," "remove accidental complexity," or wiring
the skill into a loop or cron job.

### `/doc-reconcile`

Finds documents that contradict each other, dates each conflicting claim from
its real edit history, and deletes the older side when the dating is
decisive.

Triggers: "which doc is right," "the docs contradict each other," "remove
outdated docs."

### `/skill-debug`

Debugs a skill from the sessions that ran it. Locates every recent run in
session transcripts. Compacts each one into a numbered trace of what the
agent actually did, then aligns that trace against what the SKILL.md
required. Every proposed edit cites a step number from a real run.

Triggers: "debug this skill," "why did /x do that," "the skill ignored its
own steps."

### `/skill-migrate`

Migrates a SKILL.md, agent definition, CLAUDE.md, memory file, or instinct
file to work on newer models by blind rewrite. It extracts a behavioral
contract, then sorts each instruction into scaffolding or essential. A blind
writer rebuilds the artifact from that contract. Four automated gates -
overlap, gap audit, and two more - must clear before the migration ships.

Triggers: "migrate this skill," "migrate this agent," "tune for a newer
model," "fix skill for literal models."

### How the skills compose

```
/interview          writes scenarios + test bindings into an OpenSpec change
        |
        v
implementation       usually via /step-by-step or /cheap-step
        |
        v
dod-guard cover <id> checks binding + reachability, ratcheted against
                     the coverage-gate baseline
        |
   clean run
        v
openspec archive     run by /step-by-step's Finishing phase
```

`/ratchet`, `/adversarial-workflow`, `/blind-rewrite`, and `/tighten` each
work against a change id and close the same way: a clean `dod-guard cover`
run followed by `openspec archive`. `/clean-house`,
`/test-integrity-checker`, `/doc-reconcile`, `/skill-debug`, and
`/skill-migrate` sit outside that loop - they clean up, audit, or repair
rather than plan or execute a change.

External dependencies, all optional:

| Skill | Wants | Degrades to |
|---|---|---|
| `ratchet` | gitevo, evomcp, obsidian-rag, code-review-graph | Manual branching and no learning persistence |
| `cheap-step` | evomcp + a configured cheap model | Use `/step-by-step` instead |
| `clean-house` | code-review-graph (dead-symbol scan), jscpd (duplication) | git archaeology and grep only |

All twelve skills ship inside the plugin. No manual installation.

## Development

```bash
npm install
npm run build    # TypeScript compilation -> dist/
npm test         # build + node --test on dist/*.test.js
npm run bundle   # esbuild -> dist/bundle.js (what ships)
npm start        # run the MCP server
```

`dist/bundle.js` is both the MCP server and the CLI - `process.argv.slice(2)`
decides which. Publishing goes through a git tag (`dod-guard-v<version>`),
never by copying a bundle into the plugin cache.

## License

MIT
