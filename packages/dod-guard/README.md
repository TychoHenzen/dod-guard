# dod-guard

Anti-cheat Definition of Done verification for Claude Code. Locks proof commands in MCP storage so editing the rendered markdown cannot weaken verification.

## What it does

- **Locks proofs canonically** — proof commands stored in MCP, not in editable markdown
- **Tamper-blocking** — SHA256 fingerprint mismatch forces the verdict to FAIL, not just a warning
- **Behavioral predicates only** — no mechanical metrics (line counts, log counts) that a weak model can game without fixing behavior
- **Scoped checking** — `node_path` verifies one subtree fast; an unscoped run with drafts left can never return PASS
- **Amendment audit trail** — all proof modifications logged with mandatory reasons
- **Stuck detection** — a node amended three or more times forces a STUCK verdict, overriding PASS. Repeatedly rewriting a proof until it goes green is the approach being wrong, not the proof
- **Structured interviews** — `/interview` skill gathers requirements before implementation

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

## MCP Tools

| Tool | Description |
|------|-------------|
| `dod_create` | Create a locked DoD with a recursive `TaskNode` tree. Nodes are `draft` (intent only) or `concrete` (proof command + predicate). Validates that commands reference tools available on the host OS |
| `dod_check` | Execute concrete proofs from canonical storage, return PASS/FAIL/INCOMPLETE. Drafts are reported but skipped, so the verdict stays INCOMPLETE while any remain. Optional `node_path` scopes the run to one subtree |
| `dod_refine` | Turn a draft leaf into a concrete proof (`concretize`) or split it into child subtasks (`subdivide`) |
| `dod_add_node` | Add a draft or concrete node under a task group, or at root level |
| `dod_remove_node` | Remove a node and all its descendants |
| `dod_tree` | Read-only dump of the node tree with stable IDs, paths, titles, and statuses. Use it to find `node_path` values without running proofs |
| `dod_status` | Read the cached last check result without re-running |
| `dod_amend` | Modify a concrete proof's command, predicate, or description with a mandatory audit trail. Resets the proof to pending |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse an existing DoD markdown file into canonical storage and lock its proofs |
| `dod_adversarial_gate` | Record a GO/REVISE/STOP verdict for a DoD phase. Used by `/adversarial-workflow` to block phase N+1 until phase N passes |
| `dod_store_migrate` | One-time migration of legacy `steps`-format documents to the current `roots` tree format. Idempotent |

## CLI

The same binary is a shell CLI, so a DoD subtree can gate other tools:

```bash
dod-guard check --dod-id=<id> [--node-path=0.children.1] [--quiet]
dod-guard tree --dod-id=<id>      # find --node-path values
dod-guard status --dod-id=<id>
dod-guard list
```

Exit codes: `0` pass · `1` a proof failed (or tampered/stuck) · `2` an unscoped run with drafts remaining · `3` usage error. A scoped run exits `0` when that subtree passes, which is what makes a subtree usable as a `verify_cmd` in evomcp or `/cheap-step`.

## Skills

The plugin ships eleven skills and fifteen specialized agents.

| Skill | Use it for |
|---|---|
| [`/interview`](#interview) | Gathering requirements before any implementation |
| [`/ratchet`](#ratchet) | Complex multi-sub-problem work with unknown unknowns |
| [`/step-by-step`](#step-by-step) | Executing a multi-step plan without batching or corner-cutting |
| [`/cheap-step`](#cheap-step) | The same, with implementation offloaded to a cheap model |
| [`/adversarial-workflow`](#adversarial-workflow) | Gated 4-phase review on non-trivial features |
| [`/clean-house`](#clean-house) | Hunting duplicate and obsolete implementations |
| [`/test-integrity-checker`](#test-integrity-checker) | Tests that bless bugs instead of catching them |
| [`/blind-rewrite`](#blind-rewrite) | A rewrite that keeps coming back as a renamed variable |
| [`/tighten`](#tighten) | Removing accidental complexity on a loop, one target at a time |
| [`/doc-reconcile`](#doc-reconcile) | Documents that contradict each other |
| [`/skill-debug`](#skill-debug) | A skill that does not do what its SKILL.md says |
| [`/quality-refactor`](#quality-refactor) | Refactoring to an explicit, machine-checked quality bar (ships in quality-guard) |

### `/interview`

Structured requirements gathering skill. Researches the codebase, asks targeted questions one at a time, builds a confirmed requirements summary, then creates a locked DoD via `dod_create`.

The output is a self-contained spec with testable proofs — hand it to `/step-by-step` or `/ratchet` for implementation.

Triggers: any implementation task, feature request, bug fix, or refactor, before writing code or plans.

### `/step-by-step`

Executes a multi-step plan by dispatching ONE fresh subagent per atomic step. The orchestrator holds only the current step plus a compact result of the last one, so its context stays lean regardless of step count — which removes the pressure that makes models batch steps, skip verification, and "wrap up" around step 5.

Each step carries a `verify_surface` tag (`code`, `visual`, `gameplay`, `config`, `structural`) that decides what counts as verified. A passing build proves the code compiled; it proves nothing about what the UI looks like. Ships the `step-implementer` and `step-fixer` agents. Session state in `.step-session/` survives compaction.

Triggers: "work through this step by step", "don't batch", or any plan with 5+ steps.

### `/cheap-step`

`/step-by-step` with implementation offloaded to cheap-worker fanout (evomcp solve → DeepSeek). The host model writes the specs, reviews the results, and fixes what the cheap workers can't crack. 90%+ of the work costs pennies; the host model only touches the hard 10%.

Triggers: "cheap step", "offload to deepseek", "delegate the grunt work".

### `/adversarial-workflow`

Four phases, each gated by adversarial review before the next can run: Spec Review → Test Audit → Implementation Review → Structural Cleanup. Verdicts are stored canonically via `dod_adversarial_gate`, so `dod_check` blocks phase N+1 until phase N is GO.

Ships six review agents: `adversarial-spec-reviewer`, `adversarial-security`, `adversarial-test-auditor`, `adversarial-new-hire`, `adversarial-saboteur`, `adversarial-spec-auditor`. The implementation-review agents have mandatory finding quotas — a reviewer that returns "looks good" has not reviewed.

Triggers: "adversarial workflow", "gate this", "strict quality", "full adversarial pass".

### `/test-integrity-checker`

Detects and fixes tests that bless production bugs instead of catching them: logic mirroring (the test reimplements the same algorithm as the code), output blessing (expected values copied from buggy output), weak assertions (`toBeDefined`/`toBeTruthy`), mock-everything tests that pass vacuously, symmetry and inverse tests that cancel a shared bug, and missing negative cases. Ships the `test-integrity-auditor` agent.

Triggers: "audit my tests", "are these tests real", "tests pass but the bug shipped".

### `/ratchet`

Unified ratcheting workflow combining dod-guard, gitevo, evomcp, obsidian-rag, and code-review-graph. Two-phase: interactive setup (triage + requirements + DoD + user lock-in), then autonomous /loop execution with verification gates every cycle. For complex multi-sub-problem work.

Triggers: "solve with ratchet", "ratchet this", "complex problem", "multi-step solution".

### `/clean-house`

Aggressively hunts down duplicate and obsolete implementations using git archaeology. Finds old versions of replaced features, traces authorship via git blame, migrates confused-model changes to the current version, then deletes dead code. Backwards compatibility is treated as irrelevant unless proven otherwise.

Triggers: "clean house", "dedupe", "clean up old versions", "remove dead implementations", "consolidate duplicates", "debloat".

### `/blind-rewrite`

Replaces an implementation by deleting it first, then rebuilding it from a contract that a fresh agent receives without ever seeing the old code. Fixes the failure where a model asked for a complete rewrite returns a renamed variable. Ships `blind-contract-extractor`, `blind-writer` and `blind-gap-auditor`, plus `overlap-scan.mjs`, a gate that scores the result against the deleted original and rejects paraphrase.

Triggers: "rewrite this properly", "complete rewrite", "no cosmetic changes", "swap this library", or a rewrite that came back as a cosmetic edit.

### `/tighten`

An autonomous loop that removes accidental complexity one target per invocation. It ranks the repository by structural violations joined against git return-churn, then blind-rewrites the worst target. Ships `intent-analyst`, which separates necessary complexity from accidental, and `characterization-writer`, which builds an oracle when the target has none. Two gates must pass: the result has to be different, and it has to be smaller.

Triggers: "tighten the codebase", "remove accidental complexity", or wiring the skill into `/loop`.

### `/doc-reconcile`

Finds documents that contradict each other, dates each conflicting claim from its real edit history, and deletes the older side when the dating is decisive. Ships the `doc-conflict-judge` agent.

Triggers: "which doc is right", "the docs contradict each other", "remove outdated docs".

### `/skill-debug`

Debugs a skill from the sessions that ran it. `find-runs.mjs` locates every recent run in the session transcripts. `extract-run.mjs` compacts one run into a numbered trace of what the agent actually did. The skill then aligns that trace against what the SKILL.md required and reports each divergence with its cause. Every proposed edit cites a step number from a real run, so no skill gets rewritten from taste.

Triggers: "debug this skill", "why did /x do that", "the skill ignored its own steps".

### `/quality-refactor`

Systematic refactoring to an explicit, machine-checked quality bar: one type per file, files under 300 lines, cyclomatic complexity under 10, at most 7 parameters, no unnamed tuples, guard clauses instead of `else`, free functions instead of stateless methods, and aggressive removal of dead, test-only, duplicate, and compatibility-shim code.

Ships `scripts/quality-scan.mjs` — a zero-dependency structural scanner (TypeScript/JavaScript, C#, Rust, Python, Go, Java, C++) with a ratcheting baseline, so preferred bounds can only ever improve:

```bash
node "$QS" src --fail-on=error                                     # hard gate
node "$QS" src --baseline=.quality/baseline.json --fail-on=regression   # ratchet
```

The skill produces a `.step-session/steps.json` plan ordered in waves (delete → dedupe → split → simplify → signatures → cosmetic) and hands it to `/step-by-step` for execution. It does not execute steps itself.

Triggers: "refactor this properly", "clean this up to a high standard", "enforce code quality", "quality pass", "reduce complexity", "this file is too long".

### How the skills compose

Two skills produce plans, two execute them, and the rest gate or clean up:

```
PLAN                      EXECUTE                    GATE
────                      ───────                    ────
interview        ──┐   ┌─► step-by-step  ──► dod_check
  → locked DoD     ├───┤     (step-implementer,        │
quality-refactor ──┘   │      step-fixer)               │
  → steps.json         └─► cheap-step                   │
                             (evomcp → DeepSeek)        │
                                                        ▼
ratchet ─────────────► one sub-problem per loop iteration,
                       ratchet gate every cycle

adversarial-workflow ► dod_adversarial_gate ──► blocks phase N+1 until N is GO

clean-house ─────────► deletes duplicate/obsolete implementations
test-integrity-checker ► rewrites tests that bless bugs
```

External dependencies, all optional:

| Skill | Wants | Degrades to |
|---|---|---|
| `ratchet` | gitevo, evomcp, obsidian-rag, code-review-graph | Manual branching and no learning persistence |
| `cheap-step` | evomcp + a configured cheap model | Use `/step-by-step` instead |
| `clean-house` | code-review-graph (dead-symbol scan), jscpd (duplication) | git archaeology and grep only |
| `quality-refactor` | none — the scanner is zero-dependency | — |

All eleven skills and fifteen agents ship inside the plugin. No manual installation.

## How it works

### Proof lifecycle

```
/interview → dod_create → dod_refine → [implement] → dod_check → PASS/FAIL
                          (draft →                        ↓
                           concrete)             dod_amend (if unreasonable)
```

1. **Create** — `/interview` or a direct `dod_create` call locks the node tree in `~/.claude/dod-store/`
2. **Refine** — `dod_refine` turns draft leaves into concrete proofs, or subdivides them into subtasks
3. **Implement** — work the tree; the proofs are the acceptance criteria
4. **Check** — `dod_check` executes commands from the locked store, not from the markdown
5. **Amend** — if a proof is genuinely unreasonable, `dod_amend` modifies it with a logged reason

### Anti-cheat properties

- Proof commands live in `~/.claude/dod-store/{uuid}.json`, not in the markdown file Claude reads and can rewrite
- `dod_check` reads from the store — editing the rendered proof text has zero effect on verification
- Each check prints a SHA256 fingerprint; a mismatch forces FAIL rather than warning
- All amendments are permanently logged with timestamps and reasons
- Three or more amendments on one node forces STUCK, which overrides PASS even when every proof is green

### Predicate types

| Type | Value | Passes when |
|------|-------|-------------|
| `exit_code` | `0` | Command exits 0 |
| `exit_code` | `1` | Command exits 1 (e.g. grep no matches) |
| `exit_code_not` | `0` | Command exits non-zero |
| `output_contains` | `"text"` | stdout contains text |
| `output_matches` | `"regex"` | stdout matches regex |
| `output_not_contains` | `"text"` | stdout does NOT contain text |
| `output_not_matches` | `"regex"` | stdout does NOT match regex |
| `tdd` | `0` | **TDD enforcer.** Must be observed failing before it can pass |

Three more are **gate predicates** — they read recorded state rather than running a check of their own:

| Type | Value | Passes when |
|------|-------|-------------|
| `adversarial` | phase number | The DoD's `adversarial_gates[]` entry for that phase is GO. Written by `dod_adversarial_gate` |
| `holdout` | SHA-256 | A holdout test's fingerprint still matches — the test was not weakened or deleted |
| `convergence` | — | The Phase 4 convergence audit reached GO |

**Core principle: behavioral predicates only.** Every proof is a concrete, falsifiable claim about what the implementation does. There are deliberately no mechanical quality metrics (line count, log count, assertion count) — weak models game those without fixing behavior. Structural quality is enforced separately by `/quality-refactor`, which uses a real scanner and a ratcheting baseline.

**Advisory tier.** Any proof may set `advisory: true`: a failing advisory proof warns loudly but does not fail its node or the overall verdict. The flag is part of the proof fingerprint, so a hard gate cannot be silently downgraded.

**Timeouts.** Proofs default to a 120s command timeout; set `timeout_ms` for slow tools.

### TDD enforcement

The `tdd` predicate enforces test-driven development by requiring proof of a red-green cycle:

1. Write a failing test
2. Run `dod_check` — records the failure (RED phase, `seen_failing=true`)
3. Implement the feature
4. Run `dod_check` again — test passes AND was previously seen failing → proof passes

If a test passes without ever being observed failing, dod-guard rejects it with **"TDD VIOLATION"**. This prevents writing tests after implementation that merely confirm existing behavior.

### Human-verified criteria

Some acceptance criteria can't be machine-checked — "the app launches and the dashboard renders correctly". **There is no `manual` predicate.** A predicate whose verdict a model can request is a predicate a model can eventually talk its way past, so dod-guard does not have one.

Instead, a human-verified criterion stays a **draft leaf** carrying a `MANUAL:` intent. Drafts are reported by `dod_check` but never executed, and any remaining draft holds the overall verdict at **INCOMPLETE** — never PASS, never FAIL. That is the correct semantic: "a human still owes us something" is not the same as "checked and failed".

The consequence is the anti-cheat property. Claude cannot mark the criterion verified, because there is nothing to mark; the only way the verdict leaves INCOMPLETE is for a human to look, decide, and either `dod_refine` the draft into a real machine-checkable proof or accept the DoD as incomplete. A model working alone can never reach PASS on a DoD that contains one.

### OS-correct commands (no bash-on-Windows)

Proof commands execute on the **host OS** via `dod_check`. To stop the common failure of authoring Linux/bash commands that then fail on a Windows host (and the slow `dod_amend` cleanup that follows), dod-guard validates commands **up-front**:

- On `dod_create`, `dod_refine`, and `dod_amend`, every proof command is parsed for the executables it invokes (across pipes and `&&`/`||`/`;` chains, respecting quotes).
- Each executable is checked against the current OS: cmd.exe built-ins, anything on `PATH` (`where` / `command -v`), or a real file at the working directory.
- If any tool is missing, the operation is **rejected** with the offending tools and a suggested native replacement (`grep`→`findstr`, `cat`→`type`, `ls`→`dir`, `rm`→`del`, …). The DoD is not created or amended until the commands are OS-correct.

This forces correct commands at authoring time instead of discovering breakage at check time. Criteria that genuinely need a human stay draft leaves (see above) rather than becoming a shell command.

Shell invocation lives in one place — `buildShellInvocation()` in `evaluate-proof.ts`. On Windows it produces `cmd.exe /d /s /c "<command>"` with `windowsVerbatimArguments: true`. Both details are load-bearing: cmd.exe has no single-quote grouping, and Node's default Windows quoting mangles embedded double quotes into no-ops that exit 0.

### Tamper detection (blocking)

Each DoD stores a SHA256 fingerprint of its proof set at creation time. On every `dod_check`, the current fingerprint is compared to the stored original. If they don't match — the store was edited outside `dod_amend` — the verdict is **forced to FAIL** (not merely warned). `dod_amend` legitimately re-locks the fingerprint, so real changes go through the audited path; a raw store edit can never return PASS.

### Proof categories

Every proof declares a `category` — `behavioral`, `wiring`, `other`, or `test_audit` — and each DoD declares a `type`: `bug`, `general`, or `minimal`. On `dod_create`, a non-`minimal` DoD with zero `behavioral` proofs is **warned** about, because a DoD proven entirely by wiring and structural checks proves that code exists, not that it works. Company baselines live in `standards/dod-baselines.md`.

### Scoped checking

`dod_check` accepts an optional `node_path` (use `dod_tree` or the CLI's `tree` command to find one). A scoped run executes only that subtree's proofs and carries every other leaf forward from its last recorded result — fast iteration without paying for the whole suite. Scoped runs never overwrite the canonical last full verdict.

The MCP verdict for a scoped run is always **INCOMPLETE**, never PASS, so a scoped check cannot satisfy a completion gate. The CLI is deliberately different: `dod-guard check --node-path=... ` exits **0** when that subtree passes. That is what makes a DoD subtree usable as a `verify_cmd` in evomcp or `/cheap-step` — the shell needs a pass/fail signal for the part it just built, while the MCP verdict stays honest about the whole tree.

## Development

```bash
npm install
npm run build    # TypeScript compilation → dist/
npm test         # build + node --test on dist/*.test.js
npm run bundle   # esbuild → dist/bundle.js (what ships)
npm start        # run the MCP server
```

`dist/bundle.js` is both the MCP server and the CLI — `process.argv.slice(2)` decides which. Publishing goes through a git tag (`dod-guard-v<version>`), never by copying a bundle into the plugin cache.

## License

MIT
