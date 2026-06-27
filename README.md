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
| `dod_check` | Execute proofs from canonical storage, return PASS/FAIL. Optional `step` N verifies one step (scoped → INCOMPLETE, never PASS) |
| `dod_status` | Read cached last check result without re-running |
| `dod_amend` | Modify a proof with mandatory reason (audit-logged) |
| `dod_list` | List all tracked DoDs with status |
| `dod_import` | Parse existing DoD markdown and lock its proofs |

## Skills

### `/interview`

Structured requirements gathering skill. Researches the codebase, asks targeted questions one at a time, builds a confirmed requirements summary, then creates a locked DoD via `dod_create`.

The output is a self-contained spec with testable proofs that can be passed to `/goal` for autonomous implementation.

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
| `manual` | — | **Human-verified.** Confirmed by the user during `dod_check` via a channel Claude cannot drive — see Manual verification |
| `review` | — | **Fresh-context code review.** The agent runs `/code-review` against the diff vs requirements; the PASS/FAIL verdict arrives through the same out-of-band channel as `manual` (model cannot self-pass). For intent/edge-case correctness commands can't assert |
| `mutation` | `N` (default `0`) | **Mutation testing.** Runs the command in-band, parses surviving (un-killed) mutants from Stryker / mutmut / cargo-mutants output, and passes iff survivors `<= N`. Output it cannot parse FAILs (fail-safe — never auto-passes). The strongest signal that tests actually catch bugs; scope to changed/critical functions |

### TDD enforcement

The `tdd` predicate enforces test-driven development by requiring proof of a red-green cycle:

1. Write a failing test
2. Run `dod_check` — records the failure (RED phase, `seen_failing=true`)
3. Implement the feature
4. Run `dod_check` again — test passes AND was previously seen failing → proof passes

If a test passes without ever being observed failing, dod-guard rejects it with **"TDD VIOLATION"**. This prevents writing tests after implementation that merely confirm existing behavior.

### Manual verification

Some acceptance criteria can't be machine-checked (e.g. "the app launches and the dashboard renders correctly"). The `manual` predicate covers these — but in a way Claude **cannot fake**.

When `dod_check` reaches a `manual` proof:

1. A distinctive **audible jingle** (Windows) plays to draw the user's attention.
2. The server asks the human directly through a channel Claude does not control:
   - **MCP elicitation** — if the client supports it, a structured pass/fail prompt is shown by the client and the answer returns over the protocol.
   - **Windows dialog fallback** — if the client lacks elicitation support, the server spawns a blocking Yes/No dialog.
3. The human's verdict is recorded on the proof (`manual_result`) with a timestamp, channel, and a fingerprint of the proof text.

**Anti-cheat guarantee.** `dod_check` accepts **no parameter** that could carry a "passed" verdict. The answer is sourced solely from elicitation or the server-spawned dialog — both outside the model's reach. Claude cannot supply, infer, or fabricate the confirmation. If no human is available (non-interactive run, or the dialog times out), the proof **fails** — a missing human can never produce a pass.

**Persistence.** A confirmed PASS is cached and reused on later `dod_check` runs so the human isn't re-prompted needlessly. The cache is keyed to a fingerprint of the proof's command, predicate, and description — if the proof changes (e.g. via `dod_amend`), the cache is invalidated and the human is asked again. A FAIL is never cached as reusable, so a fix can be re-verified immediately.

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
