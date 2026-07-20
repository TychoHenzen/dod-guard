# dod-guard: Top 10 Shortcomings

_Investigation date: 2026-07-20. Scope: `packages/dod-guard/src/`. Focus: does the anti-cheat premise actually hold, plus correctness and code-health issues found while reading the engine._

dod-guard's thesis (baseline.ts:8) is that **"an agent must not be trusted to self-police its proofs."** Most findings below are places where that thesis leaks — the authoring agent still controls verification — or where the tamper machinery has holes. A few are plain bugs and code litter.

Severity legend: 🔴 defeats the core guarantee · 🟠 significant hole · 🟡 correctness/quality.

---

## 1. 🔴 The threat model only covers out-of-band file edits — the agent still authors and rewrites every proof

Tamper detection (checker.ts:391-394) compares the stored `proof_fingerprint` against a live recompute. It catches one thing: someone editing `~/.claude/dod-store/<id>.json` *outside* the MCP tools.

But the agent under test has `dod_create`, `dod_refine`, `dod_amend`, `dod_add_node`, `dod_remove_node` — and **every one of them recomputes and re-stores the fingerprint** (e.g. index.ts:774, index.ts:678, index.ts:389). So an agent that wants a weaker proof does not tamper; it *amends*, and the fingerprint quietly follows. The only friction is:

- `dod_amend` blocks machine→manual/review downgrades (index.ts:723-738), and
- an audit-trail entry + an "excessive amendment cycles" warning after >2 amends (checker.ts:379-381).

A warning is not a gate. The agent choosing what "done" means is exactly the situation the thesis says must not be trusted, and the current design re-admits it through the front door. **Tamper detection guards the file, not the verdict.**

## 2. 🔴 Machine predicates are trivially satisfiable no-ops; placeholder detection is a blocklist

`output_contains`/`exit_code`/`output_matches` are evaluated against whatever the authored command prints (evaluate-proof.ts:658-677). `echo PASS` + `output_contains: "PASS"` passes. `isPlaceholderCommand()` (command-check.ts:394-412) tries to catch this, but it is a fixed regex **blocklist** (`echo ok`, `true`, `exit 0`, `node -e process.exit(0)`, …). It does not catch `echo PASS`, `echo "all green"`, `type file-that-exists`, `dir`, `ver`, `cmd /c "exit 0 & rem"`, or any of the infinite other always-zero commands. A blocklist can never enumerate "commands that verify nothing," and even when it fires it only **warns** (index.ts:779-786) — it never fails the proof. The one predicate with real teeth (`tdd`, requiring a prior RED) is opt-in.

## 3. 🔴 Nothing ties proofs to the actual code state — no working-tree, build-state, or cross-proof coupling

There is no `git status`/`--porcelain`/`rev-parse` anywhere in the source (verified by grep). Consequences:

- Proofs run **independently and sequentially** (checker.ts:315-323). A proof can pass against uncommitted, half-reverted, or stale working-tree state, and dod-guard has no idea what commit/state it verified.
- Proofs **mutate the tree they run in**. `detectMutatingFlags` (command-check.ts:355-369) only *warns* about `tsc` (writes `dist/`), `stryker`, `cargo build`, `npm install`, etc. So proof N can dirty the tree that proof N+1 reads — ordering-dependent, non-reproducible verdicts, and no atomic "all proofs against one frozen snapshot" guarantee.
- A full PASS means "each command exited happily at some point," not "the current code satisfies all of them simultaneously."

## 4. 🟠 The fingerprint omits most proof-strength fields — silent store-side weakening evades tamper detection

`computeProofFingerprint` hashes only `command | predicate.type | value` (+ conditional `lib:` / `adv:`) (checker.ts:118-130). It does **not** hash: `timeout_ms`, `extract` (regression capture regex), `category`, `min_replacement_ratio`, `max_function_lines` / `max_file_lines` / `max_line_length` / `max_complexity`, or `baseline_value`.

So editing the store JSON to set `max_function_lines: 9999`, loosen the regression `extract`, or overwrite a captured `baseline_value` gutts the proof **without changing the fingerprint** → `tampered === false`. The one mechanism meant to detect store edits is blind to the exact fields most worth editing. (It is also truncated to 12 hex chars / 48 bits — a lesser concern than the field omissions, but it further weakens the guarantee.)

## 5. 🟠 Regression proofs self-capture their own baseline, pass free on first run, and the baseline is unprotected

`hRegress` (evaluate-proof.ts:145-180): on the first run `baseline_value` is undefined, so it records whatever number came out **and returns `status: "pass"`**. The agent both picks *when* the baseline is captured (i.e. when the metric is most favorable) and gets a free PASS for doing so. Thereafter comparison is against that self-chosen number, which — per finding #4 — is not in the fingerprint and can be edited in the store with no tamper flag. A "no regression" gate whose reference point is chosen and mutable by the party being gated is not much of a gate.

## 6. 🟠 Static analyzers pick their target files from the command string, not from what changed

`assertions`, `observability`, and `brevity` predicates derive the files to analyze by regex-scanning the **proof command text** (`analyseAssertions(cmd, cwd)` etc., evaluate-proof.ts:217, 251, 309). The files analyzed need not be the files changed. Point the command at a well-instrumented or already-clean file (`biome check src/well-written.ts`) and the observability/brevity/assertion proof passes while the real change sits elsewhere, untouched by the analyzer. The static checks measure *a* file, not *the* file.

## 7. 🟠 `dod_import` + `dod_check` is arbitrary remote code execution with no consent gate

`dod_check` runs every concrete leaf's command via `exec(command, { shell: cmd.exe|/bin/sh })` (checker.ts:148-157). `dod_import` (index.ts:851-925) ingests an arbitrary markdown file, infers commands, and stores them. Importing a DoD authored elsewhere and running `dod_check` therefore executes attacker-controlled shell on the host — the only guards are a timeout and an OS-tool-existence check. There is no allowlist, no sandbox, and no user-confirmation step before the first execution. For a tool whose whole job is to run untrusted-agent commands, the absence of any execution boundary is a notable gap.

## 8. 🟠 Anti-cheat has real teeth only for manual/review proofs, and those are entirely opt-in

The one channel Claude genuinely cannot drive is human elicitation (manual.ts, index.ts:99-155). But:

- A DoD can be authored with **zero** manual/review proofs. The baseline (baseline.ts) makes `integration_wiring`/`integration_behavioral`/`test` mandatory — all machine predicates, all gameable per #2.
- `blockedByManuals` (checker.ts:384) only bites **if** manual proofs exist and are unverified. No manuals → no human in the loop at all.
- The `review` predicate just instructs the human to "run `/code-review`" (index.ts:87-91) — delegating the check back into the same agent ecosystem it is supposed to police.

So the strongest guarantee is exactly the one an agent can author its way around.

## 9. 🟡 Legacy migration writes a fingerprint in a different algorithm than the checker → every migrated doc permanently reports TAMPER / FAIL

`store.migrateDoc` computes the fingerprint as **full 64-char SHA-256** over **sorted** lines formatted `command|type|value|advisory` with no separator (store.ts:150-165). `computeProofFingerprint` computes a **12-char** hash over **unsorted** `\n`-joined lines formatted `command|type|value` (+conditional `|lib:` / `|adv:`) (checker.ts:118-130). These can never be equal.

After migration the doc has a 64-char stored fingerprint; the first `dod_check` recomputes 12 chars; `doc.proof_fingerprint !== proofFingerprint` (checker.ts:394) is always true → `overall` forced to `fail` with "TAMPER DETECTED." The auto-adopt at index.ts:208 does not save it, because it only runs when there is *no* stored fingerprint. **Result: legacy docs migrated via `dod_store_migrate` are bricked into permanent false-tamper FAIL.** (Divergence confirmed by reading both functions; runtime effect inferred, not executed.)

## 10. 🟡 Two sources of truth despite the "canonical store" claim, plus production `console.debug` litter

- **Round-trip risk.** The store is described as canonical and markdown as non-authoritative, yet `dod_import` reconstructs a `DodDocument` by *parsing markdown and inferring predicates* (index.ts:872, parser.ts). Inference is lossy: an imported proof can silently land on a weaker predicate than the author intended, and the store then blesses it. A genuinely canonical store would not have a markdown→predicate inference path feeding back into it.
- **Debug litter in shipped code.** `console.debug` calls sit in production modules, several as **top-level module-load side effects** that fire on every server start whether or not the code is used: types.ts:4, find-functions.ts:1, manual.ts:28, regression.ts:1, evaluate-proof.ts:1, plus per-call logs in baseline.ts:200, author.ts:141, parser.ts:287, format-result.ts:4, observability.ts. Harmless to the MCP stdout channel (they go to stderr) but they are noise the tests do not need and the product should not ship. There is also mojibake in committed source/comments (e.g. checker.ts:196 `// â”€â”€`) from an encoding round-trip.

---

## Cross-cutting theme

Eight of the ten trace to one root: **the agent being verified retains write authority over the definition of "verified."** dod-guard has invested heavily in *edit-detection* (fingerprints, audit trails, amendment-count warnings) but the actual attack surface is *authorship* — the agent picks the commands, the thresholds, the baseline capture moment, and whether any human is involved at all. The fingerprint work raises the cost of editing the store file behind dod-guard's back, which is not the threat the thesis names.

## Suggested direction (not prescriptive)

- Bind every full `dod_check` to a captured VCS state (record `git rev-parse HEAD` + dirty flag; refuse or flag PASS on a dirty tree).
- Run proofs against a frozen snapshot (temp worktree/checkout) so proofs cannot dirty each other's inputs.
- Include **all** strength-bearing predicate fields (thresholds, `extract`, `timeout_ms`, `baseline_value`) in the fingerprint, and stop truncating it.
- Replace the placeholder **blocklist** with positive evidence requirements (e.g. require a `tdd`/RED transition or a named-file-that-changed check for behavioral categories).
- Unify the three fingerprint implementations into one function (fixes #9 outright).
- Gate first-time execution of imported DoDs behind explicit user confirmation; strip debug litter and fix the mojibake.
