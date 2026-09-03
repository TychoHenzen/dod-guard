# Stopping LLMs From Locking In Their Own Wrong Guesses

## TL;DR
- The best fix is not one big assumption list. It is a layered system: force the model to surface assumptions *before* it codes (plan mode + an "ask before you assume" rule), pin only confirmed decisions in a short, status-tagged decisions file, and let tests, types, and a fresh-session critic catch the assumptions that slip through.
- Your instinct to reject the flat "list of all assumptions" is backed by data: a 2026 ETH Zurich study found repository context files gave "no improvement in task success rates, while also increasing inference cost by over 20%," and one wrong line poisons trust in the whole file. Keep the durable record tiny and status-tagged; push volatile stuff into code comments and tests that live next to the code and rot less.
- Ranked by payoff-per-effort, start with three cheap habits (plan-mode-first, "state assumptions and ask" preamble, commit per step), then add a status-tagged `decisions.md` and executable tests, and reserve a second-model critic pass for high-stakes changes.

## Key Findings

**The failure mode is real and has a name.** Coding agents "over-commit to an early hypothesis" and keep conditioning on their own earlier output - "output becomes input," so a confused step feeds forward into the next. When the model writes its guesses into a notes file, those guesses "outlive your chat correction": you fix it in chat, but the stale note stays on disk, gets re-read next session, and becomes the version that wins.

**Your instinct to avoid a giant assumption list is backed by data.** Gloaguen, Mündler, Müller, Raychev and Vechev (ETH Zurich SRI Lab / LogicStar.ai), in "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" (arXiv:2602.11988, Feb 2026), tested Claude Sonnet 4.5, GPT-5.2 and Qwen3-30B across SWE-bench Lite plus a new 438-task benchmark and found "context files result in no improvement in task success rates, while also increasing inference cost by over 20%." Worse, model-generated context files "reduced task success rates in 5 of 8 evaluation settings, with an average performance drop of 0.5 to 2 percentage points." And a wrong line in a context file is worse than no line: "once one line in that file is wrong, you cannot trust any of it, and the agent confidently follows the wrong instruction instead of reading the code." A fat, flat list of every assumption is exactly the artifact most likely to ossify mistakes.

**The winning pattern is layered, not monolithic.** Separate three things: (1) *provisional assumptions* the model is acting on right now: surface these live, before coding; (2) *confirmed decisions*: a short, status-tagged record; (3) *everything else*: let the code, tests, and types be the source of truth so docs can't drift away from reality.

## Details

### Tier 1 - Cheap habits, big payoff (do these always)

**1. Plan before code, and read the plan.** Claude Code's plan mode is a hard, tool-level read-only sandbox: the model reads files and proposes a written plan but physically cannot edit. This "corrects misunderstandings at the cheapest possible moment - before they are baked into code." Anthropic's recommended loop is explore, plan, implement, commit. Insist the plan name the files it will change, the assumptions it is making, and how it will verify. If the plan only says "update the code," reject it. Trade-off: overhead. Skip it for one-line changes - Anthropic's own guidance says if you can describe the diff in one sentence, planning is just overhead.

**2. A standing "state assumptions, then ask" rule.** Add one line to your prompts or your project rules: *"Before writing code, list the assumptions you're making about requirements, APIs, and intent, mark each Low/Medium/High risk, and ask up to 3 clarifying questions if anything is ambiguous."* Practitioners report this single change is "night and day." Why it works: LLMs are trained to sound confident, so they default to guessing rather than asking; an explicit instruction overrides that default. The "assumption inventory" variant asks for a grouped list (product, data/edge cases, security, performance, ops) with a risk label and safe defaults if you don't answer. Trade-off: a little upfront friction, and models will still miss some assumptions - so keep the "limit to 3 questions" cap so it doesn't stall.

**3. Commit per step.** Have the agent commit after each completed task step with a descriptive message. This gives you a clean diff to review, a rollback point when it doubles down on a wrong turn, and - critically - the git history becomes the real decision log. Near-zero effort, high payoff.

**4. Start fresh when it's stuck.** The "two-correction rule": if you've corrected the same mistake twice, don't keep arguing in a poisoned context - clear the session and restart with a clean context and a corrected brief. Long sessions "rot quietly, well before any token limit is reached" because irrelevant and wrong tokens still compete for the model's fixed attention budget. `/clear` is one keystroke.

### Tier 2 - Lightweight artifacts that beat a flat list (moderate effort)

**5. A status-tagged `decisions.md` (ADR-lite).** This is the single best replacement for your "horrid" assumption list. Keep short records, each with a **Status** field: `Proposed | Accepted | Superseded | Deprecated`, plus a one-line context and consequence. The status field is the whole trick: it separates a *default the model picked* (Proposed) from a *decision you confirmed* (Accepted), and lets a decision be explicitly killed (Superseded) instead of silently lingering. ADRs are having a comeback specifically because "AI coding agents will refactor away reasoning they can't see." Keep the records as the system of record and treat CLAUDE.md/AGENTS.md as a compiled delivery format, not the source of truth. Trade-off: someone has to set statuses honestly; a "Proposed" that never gets promoted or killed is just another stale note.

**6. A separate "open questions / assumptions" queue.** Keep provisional assumptions *out* of the confirmed-decisions file. A dedicated short list of "things I assumed and haven't verified" - with the instruction that the model must flag when it acts on one - keeps the risky items visible instead of hidden inside prose. Promote an item to `decisions.md` only when you confirm it; delete it when it's resolved. This directly attacks the "treats old guesses as rigid requirements" problem by keeping guesses labeled as guesses.

**7. `# ASSUMPTION:` code comments the model emits and greps.** Extend the standard codetag convention (TODO, FIXME, XXX, HACK - formalized in PEP 350) with an `ASSUMPTION:` (or `AI-ASSUMPTION:`) tag. Instruct the agent: whenever it makes a non-obvious choice about intent or an API, drop an inline `# ASSUMPTION: <what and why>` comment. Now the assumptions live *next to the code they affect* (so they rot far less than a central doc), and you - or the agent - can `grep -rn "ASSUMPTION"` for a one-command audit. You can wire the same grep into CI to surface or count them. Why it beats a central list: locality. The note can't drift away from the code because it's attached to it.

**8. Issue-driven development for larger features.** A concise GitHub Issue records the intended outcome, constraints, and verifiable acceptance criteria. Sub-issues divide independently completable outcomes. The feature branch and pull request preserve the implementation and review evidence without maintaining a second task-document system.

### Tier 3 - Verification that catches what slips through (grounding)

**9. Tests as executable requirements (TDD).** A test encodes what the code must do in a form the model cannot rationalize away. Have the model write tests from the spec *first*, confirm they fail, then implement until they pass - and re-run the full suite so it can't silently break a prior assumption. Two caveats from the research. First, if the same model writes both the code and the tests, it can bake the same wrong assumption into both - a "cycle of self-deception" - so write or review the key tests yourself. Second, naive "do TDD" instructions can backfire: the Test-Driven Agentic Development study (arXiv:2603.17973) found that "adding TDD procedural instructions without targeted test context increased regressions to 9.94% - worse than no intervention," while telling the agent *which* tests to verify against cut regressions ~70% (6.08% to 1.82%) and lifted resolution from 24% to 32% on Qwen3-Coder 30B. The lesson: surfacing *which* tests matter beats prescribing *how* to do TDD.

**10. Types, linters, and CI gates as assumption checkers.** A type system rejects a whole class of wrong API assumptions for free. For external APIs, contract tests and schema tools (Pact, Schemathesis, Dredd) verify that response shapes, required fields, and status codes still match what the code assumes - catching the exact "I assumed the API works like X" error. Enforce non-negotiable rules in CI or pre-commit hooks, not in prose the model may interpret loosely. Property-based tests are a strong fit too: the Property-Generated Solver work (arXiv:2506.18315) found models are far better at writing correct *validating properties* than correct code - on its "Hard" task set, direct code generation reached only 1.1% accuracy while property generation reached 48.9% - turning silent wrong answers into loud, actionable property violations.

**11. A fresh-session critic pass.** For anything non-trivial, have a *second* session - ideally a *different, strong* model - review the diff against the spec, with the task: "list spec violations and unstated assumptions with file:line evidence." Why a fresh session: "the agent that wrote the code is compromised. It knows what it built. It'll rationalize." In one SWE-bench Verified experiment, pairing the CWM-32B agent with Claude Opus 4.6 as a critic lifted resolve rate from 29.2% (no critic) to 51.4% with a concise prompt and 65.0% with a detailed one. Important caveat: when the builder and reviewer share the same model/training, they share blind spots and "the agents check code against itself rather than against intent" - so a same-model second pass is weaker than teams assume and does not replace human review. Use a different model, feed the critic the spec (not just the code), and keep a human as the final gate.

### On the giant assumption list you dislike

Evaluated directly: it's the wrong primary tool. It bloats context (raising cost and diluting attention), it goes stale, and one wrong entry poisons trust in the whole file. But a *tiny* version has a place - as the "open questions" queue (#6), capped short, with everything confirmed promoted out to `decisions.md` and everything volatile pushed into `ASSUMPTION:` comments next to the code. The rule of thumb: the durable artifact should hold only what the agent cannot re-derive from the code, and every line should be verified. "Short and verified beats thorough and rotting."

## Recommendations

**Start today (Tier 1, ~15 minutes of setup):**
1. Add to your global rules file: *"Before coding on any non-trivial task, enter plan mode, list your assumptions about requirements/APIs/intent with risk labels, and ask up to 3 clarifying questions. Don't pick silently between interpretations - present them."*
2. Make plan-mode-first your default; skip it only for one-line diffs.
3. Tell the agent to commit per completed step with a descriptive message.
4. Adopt the two-correction rule: corrected the same thing twice, then `/clear` and restart with a corrected brief.

**Add within a week (Tier 2):**
5. Create a short `decisions.md` with a Status field (Proposed/Accepted/Superseded). Instruct the agent to append a Proposed entry whenever it makes an architectural choice, and to never treat a Proposed item as fixed.
6. Add an `ASSUMPTION:` codetag convention to your rules and periodically `grep` for it - this is your lightweight "assumption audit."
7. Keep CLAUDE.md/AGENTS.md under ~200 lines, put only what the agent can't infer from code, and audit it against reality regularly - the "Context Rot" study (arXiv:2606.09090) found a README/wiki consistency checker flagged stale code-element references in 23.0% of a 356-repository sample.

**Reserve for larger or high-stakes work (Tier 3):**
8. Use GitHub Issues and acceptance sub-issues when misinterpretation would be expensive.
9. Write/own the key tests; make the agent verify against them and re-run the suite. Tell it *which* tests matter, not just "do TDD."
10. Run a fresh-session, different-model critic pass on the diff before merging; keep human review as the real gate.

**Benchmarks that should change your approach:**
- If your `decisions.md` grows past ~1 page or your CLAUDE.md past ~200 lines, prune - you're entering context-rot territory, where added context raises cost (>20% in the ETH study) without improving correctness.
- If the agent repeatedly produces the same wrong output, that's a signal your context file has a stale or wrong line; audit it rather than adding more.
- If you're spending more time reviewing than you saved, shift effort from generation to the Tier 3 verification gates.

## Caveats
- **Most sources are practitioner blogs and 2026 preprints**, not peer-reviewed at scale. Treat specific percentages as directional early evidence. The strongest empirical claims (context files raise cost >20% and don't reliably improve success; 23.0% of repos carry stale references; TDD-instruction-only raised regressions to 9.94%) come from arXiv preprints.
- **The evidence on context files is nuanced, not one-directional.** A companion ICSE 2026 workshop study (Lulla et al., arXiv:2601.20404) found an AGENTS.md file *lowered* median runtime by 28.64% and output tokens by 16.58% on focused pull requests - so context files can make agents cheaper and faster even when they don't make them more *correct*. The takeaway: keep context files, but keep them short, verified, and aimed at instructions the agent can't infer - not at exhaustive assumption dumps.
- **Numbers move fast.** Tool behaviors (plan-mode keybindings, auto-memory, pricing) change frequently; verify against current docs before relying on them.
- **A second AI reviewer is not a safety net.** Shared training means correlated blind spots; it narrows but does not close the gap, and does not replace a human reading the diff.
- **These strategies reduce, not eliminate, the problem.** Compounding-error and anchoring effects are structural properties of how these models attend to context. The goal is to make wrong assumptions cheap to catch early, not to prevent them entirely.
