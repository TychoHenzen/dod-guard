# dod-guard

Anti-cheat Definition of Done verification for Claude Code. Locks proof commands in MCP storage so editing the rendered markdown cannot weaken verification.

## What it does

- **Locks proofs canonically** — proof commands stored in MCP, not in editable markdown
- **Tamper-blocking** — SHA256 fingerprint mismatch forces the verdict to FAIL, not just a warning
- **Baseline enforcement** — `dod_create` rejects a DoD missing the mandatory proof categories (two-layer integration, full test suite)
- **Incremental checking** — `dod_check --step N` verifies one step fast; only a full run can return PASS
- **Amendment audit trail** — all proof modifications logged with mandatory reasons
- **Weakening prevention** — cannot convert machine-checkable proofs to manual
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
| `dod_create` | Create a locked DoD (declares a `type`; each proof a `category`). Rejects DoDs missing mandatory baseline categories |
| `dod_check` | Execute proofs from canonical storage, return PASS/FAIL/INCOMPLETE. Optional `step` N verifies one step (scoped → INCOMPLETE, never PASS). Never auto-prompts manual/review proofs — see `dod_verify` |
| `dod_verify` | Request human out-of-band verification (popup, notes field) for ONE manual/review proof. Call it when verification is actually relevant, not on every `dod_check` |
| `dod_status` | Read cached last check result without re-running |
| `dod_amend` | Modify a proof with mandatory reason (audit-logged) |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing DoD markdown and lock its proofs |

## Skills

The plugin ships four skills for a complete quality workflow:

### `/interview`

Structured requirements gathering skill. Researches the codebase, asks targeted questions one at a time, builds a confirmed requirements summary, then creates a locked DoD via `dod_create`.

The output is a self-contained spec with testable proofs that can be passed to `/goal` for autonomous implementation.

### `/test-verification`

Verify and score test file quality across 8 dimensions (assertion quality, determinism, isolation, clarity, coverage depth, speed, diagnostics, assertion triviality). Also runs source code quality analysis (observability, brevity). Generates a scored manifest at `.claude/test-verification/manifest.json` and an HTML dashboard.

Triggers: "verify my tests", "check test quality", "audit the test suite", "find weak tests", "coverage gaps".

### `/test-fixer`

Fix test quality issues identified by test-verification. Reads the manifest, applies targeted fixes for weak assertions, flake risks, missing edge cases, poor diagnostics, and source code quality issues (empty catches, missing logs, long functions, high CC, unnecessary else). Re-verifies and updates the manifest.

Triggers: "fix my tests", "improve test quality", "fix weak tests", "fix assertion quality", "fix observability issues", "fix brevity violations".

### `/quality-upgrade`

Multi-phase orchestrator that iteratively brings test quality and source code health to a target score (~8/10). Manages 5 phases (baseline, fix cycles, coverage gaps, final verify, commit) using test-verification and test-fixer in a loop. Durable state in manifest.cycle survives session restarts.

Triggers: "upgrade quality", "improve quality to 8", "quality loop", "full quality pass", "bring tests to 8/10".

### Skill dependencies

```
quality-upgrade → test-verification + test-fixer
test-fixer → test-verification
```

All four skills are self-contained in the plugin — no manual installation needed.

> **Note for existing users:** If you previously installed `test-verification`, `test-fixer`, or `quality-upgrade` manually in `~/.claude/skills/`, remove those copies. The plugin versions are the canonical source and having both installed causes name conflicts.

## How it works

### Proof lifecycle

```
/interview → dod_create → [implement] → dod_check → PASS/FAIL
                                              ↓
                                    dod_amend (if unreasonable)
```

1. **Create** — `/interview` or direct `dod_create` call locks proofs in `~/.claude/dod-store/`
2. **Implement** — work through steps, proofs are the acceptance criteria
3. **Check** — `dod_check` executes commands from the locked store (not the markdown)
4. **Amend** — if a proof is genuinely unreasonable, `dod_amend` modifies it with a logged reason

### Anti-cheat properties

- Proof commands live in `~/.claude/dod-store/{uuid}.json` claude is not aware of, not in the markdown file claude may read/alter
- `dod_check` reads from the store — editing markdown proof text has zero effect
- Each check prints a SHA256 fingerprint — compare to detect store tampering
- Cannot weaken a machine-checkable proof to `manual` (blocked server-side)
- `manual` proofs are confirmed by the human out-of-band (elicitation / server dialog) — Claude cannot self-confirm or fabricate the answer
- All amendments are permanently logged with timestamps and reasons

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
| `manual` | — | **Human-verified.** Confirmed via `dod_verify`, called explicitly by Claude, through a channel Claude cannot drive — see Manual verification |
| `review` | — | **Fresh-context code review.** The agent runs `/code-review` against the diff vs requirements, then calls `dod_verify`; the PASS/FAIL verdict arrives through the same out-of-band channel as `manual` (model cannot self-pass). For intent/edge-case correctness commands can't assert |
| `mutation` | `N` (default `0`) | **Mutation testing.** Runs the command in-band, parses surviving (un-killed) mutants from Stryker / mutmut / cargo-mutants output, and passes iff survivors `<= N`. Output it cannot parse FAILs (fail-safe — never auto-passes). The strongest signal that tests actually catch bugs; scope to changed/critical functions |
| `regression` | `tol` (fraction, e.g. `0.10`) | **Non-regression gate.** Two-phase: a capture run on pre-change code stores the metric baseline N0; later runs compare N1 against N0 with tolerance `tol`. `extract` (regex, group 1) or the last number in stdout picks the metric; unparseable output FAILs. `lower_is_better` (default true) for perf/complexity/duplication, false for coverage. Defaults to **advisory** — set `advisory: false` for a hard SLA gate. Proves quality doesn't regress vs a baseline, never an impossible absolute target |

**Advisory tier.** Any proof may set `advisory: true`: a failing advisory proof warns loudly but does not fail its step or the overall verdict. `regression` proofs default to advisory. The flag is part of the proof fingerprint, so a hard gate cannot be silently downgraded.

### TDD enforcement

The `tdd` predicate enforces test-driven development by requiring proof of a red-green cycle:

1. Write a failing test
2. Run `dod_check` — records the failure (RED phase, `seen_failing=true`)
3. Implement the feature
4. Run `dod_check` again — test passes AND was previously seen failing → proof passes

If a test passes without ever being observed failing, dod-guard rejects it with **"TDD VIOLATION"**. This prevents writing tests after implementation that merely confirm existing behavior.

### Manual verification

Some acceptance criteria can't be machine-checked (e.g. "the app launches and the dashboard renders correctly"). The `manual` predicate covers these — but in a way Claude **cannot fake**.

**`dod_check` never auto-prompts.** Every earlier version of dod-guard fired a popup for every unverified `manual`/`review` proof on every single `dod_check` run — including proofs on steps nobody was working on yet. Now `dod_check` only *reads* whatever verdict is already on record: an unverified proof reports `skipped` and holds the overall verdict at **INCOMPLETE** (not FAIL — "not yet checked" is distinct from "checked and failed").

**`dod_verify` triggers the actual prompt.** Claude calls `dod_verify(dod_id, proof_id)` explicitly, when it judges verification is actually relevant — typically right after implementing the step that proof belongs to, not preemptively for steps still ahead. This is the only path that fires the human-facing channel:

1. A distinctive **audible jingle** (Windows) plays to draw the user's attention.
2. The server asks the human directly through a channel Claude does not control:
   - **Popup (primary)** — a server-spawned Windows dialog with PASS / FAIL buttons and a free-text **notes field**. No timeout — the human may take a while to respond, so it waits indefinitely rather than auto-failing on a clock.
   - **MCP elicitation (fallback)** — used only where the popup can't run (non-Windows hosts) and the client advertises elicitation support.
3. The human's verdict (and any note) is recorded on the proof (`manual_result`) with a timestamp, channel, and a fingerprint of the proof text. Run `dod_check` afterward to fold it into the overall verdict.

**Anti-cheat guarantee.** Neither `dod_check` nor `dod_verify` accepts a parameter that could carry a "passed" verdict. The answer is sourced solely from the popup or elicitation — both outside the model's reach. Claude can choose *when* to call `dod_verify`, but cannot supply, infer, or fabricate the confirmation itself. If no human is available (non-interactive run, or no channel on this host), the proof **fails** — a missing human can never produce a pass. And since `dod_check` no longer auto-fires the channel, Claude cannot dodge the anti-cheat by simply never calling `dod_verify` either — an unrequested manual/review proof holds the whole DoD at INCOMPLETE, never PASS.

**Persistence.** Whatever `dod_verify` last recorded (PASS or FAIL) is what `dod_check` reports — it never re-prompts on its own. The record is keyed to a fingerprint of the proof's command, predicate, and description; if the proof changes (e.g. via `dod_amend`), the fingerprint no longer matches and `dod_check` reports it unverified (`skipped`) again until `dod_verify` is called afresh. To retry a FAIL, just call `dod_verify` again — nothing about a prior FAIL blocks a new attempt.

### OS-correct commands (no bash-on-Windows)

Proof commands execute on the **host OS** via `dod_check`. To stop the common failure of authoring Linux/bash commands that then fail on a Windows host (and the slow `dod_amend` cleanup that follows), dod-guard validates commands **up-front**:

- On `dod_create`, `dod_import`, and `dod_amend`, every non-`manual` proof command is parsed for the executables it invokes (across pipes and `&&`/`||`/`;` chains, respecting quotes).
- Each executable is checked against the current OS: cmd.exe built-ins, anything on `PATH` (`where` / `command -v`), or a real file at the working directory.
- If any tool is missing, the operation is **rejected** with the offending tools and a suggested native replacement (`grep`→`findstr`, `cat`→`type`, `ls`→`dir`, `rm`→`del`, …). The DoD is not created/amended until the commands are OS-correct.

This forces correct commands at authoring time instead of discovering breakage at check time. Checks that genuinely need a human use a `manual` proof (see above) rather than a shell command.

### Tamper detection (blocking)

Each DoD stores a SHA256 fingerprint of its proof set at creation time. On every `dod_check`, the current fingerprint is compared to the stored original. If they don't match — the store was edited outside `dod_amend` — the verdict is **forced to FAIL** (not merely warned). `dod_amend` legitimately re-locks the fingerprint, so real changes go through the audited path; a raw store edit can never return PASS.

### Baseline category enforcement

Every proof declares a `category` and each DoD declares a `type` (`bug` / `general`), keyed to the company baselines in `standards/`. `dod_create` **rejects** a DoD missing the mandatory machine-checkable categories — two-layer integration (`integration_wiring` + `integration_behavioral`) and the full `test` suite — and **warns** when TDD is absent or a step is proven only by presence/structural checks. The mandate is enforced by the tool, not left to the authoring agent's goodwill.

### Incremental checking

`dod_check` accepts an optional `step` (1-based). A scoped run executes only that step's proofs and carries the others forward from their last result without re-running them — fast iteration without paying for the whole suite each time. A scoped run always returns **INCOMPLETE**, never PASS, so it can't satisfy a `/goal` completion gate; run `dod_check` with no `step` for the full verdict. Scoped runs never overwrite the canonical last full verdict.

## Development

```bash
npm install
npm run build    # TypeScript compilation
npm run bundle   # esbuild → dist/bundle.js
npm start        # Run MCP server
```

## License

MIT
