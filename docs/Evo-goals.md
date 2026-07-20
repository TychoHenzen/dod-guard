This is a great problem to think through carefully, because the core insight from AlphaEvolve actually generalizes further than it first appears — you just have to do more work to get there. Let me lay out the framing first, then the toolkit, then requirements.

## The organizing principle

AlphaEvolve works because it has a scalar fitness function, cheap evaluation, and the ability to sample many candidates and keep the best. General software development lacks the first ingredient, so the central job of your toolkit is to **manufacture verification signals** — to convert every SDLC activity into something with a machine-checkable oracle, even a partial one. The reason this compensates for weak reasoning is the verification asymmetry: checking a candidate is much easier than producing it, and weak models are dramatically better at "does this pass?" loops than at getting things right in one shot. So the design stance is: never rely on the model's judgment where you can rely on execution, and never let the generating model be its own only judge.

The second principle: weak models fail at long-range reasoning, so everything must be decomposed until each step is small enough that a dumb model plus a tight feedback loop can do it. The toolkit's job is as much about *shrinking the problem* as verifying the output.

## Tool categories and functional requirements

**1. Specification capture.** Before any code is written, fuzzy intent must be pinned into checkable artifacts. Tools: an acceptance-criteria generator that turns a task description into concrete, testable assertions; an interface/contract designer that fixes function signatures, types, and invariants up front; a spec-critique tool (ideally a stronger model or human in the loop, used sparingly at this stage only — this is your highest-leverage point for expensive intelligence). Functional requirement: the output must be *executable or mechanically checkable*, not prose. A spec the harness can't evaluate is decoration.

**2. Test-first inversion.** This is the move that recovers the AlphaEvolve structure. Have acceptance tests written and locked *before* implementation begins. Once tests exist, "implement the feature" becomes an optimization problem again: fitness = tests passing, and you can do candidate sampling, tournament selection, and iterative repair exactly like an evolutionary loop. Functional requirements: the test suite must be write-protected from the implementing agent (more on this under oracle integrity), tests must be fast enough to run hundreds of times, and the harness must report *which* assertions fail with localized context, not a raw dump.

**3. The oracle stack.** Ordered roughly from cheapest/most reliable to most expensive/least reliable, and you should always exhaust the cheaper ones first:

- Compiler and type checker. Push work into the type system aggressively — prefer typed targets, require type annotations, treat type errors as free verification. For a weak model this is the highest signal-to-cost oracle that exists.
- Linters and static analysis (semgrep rules, dataflow checks, API-misuse detectors), including custom rules encoding your codebase's conventions.
- Unit/integration test execution with structured result parsing.
- **Mutation testing** — this one is critical and underused. A weak model writes weak tests; mutation score is how you verify the verifier. "Write tests for module X" becomes an optimization problem with mutation-kill rate as fitness.
- Property-based testing and fuzzing, for generating inputs the model didn't think of (weak models have especially poor coverage of edge cases).
- Differential/equivalence testing: run old and new implementations against the same inputs and diff behavior. This gives refactoring a near-perfect oracle — behavior preservation — which means refactoring is actually one of the *safest* tasks to hand a weak model, counterintuitively.
- Runtime assertion/trace injection: instrument code with invariant checks and compare execution traces across candidates.
- LLM-as-judge with explicit rubrics, reserved for what machines can't check (naming, readability, architectural fit). Requirements: rubric-scored with per-criterion binary judgments (weak models judge better with checklists than with holistic scoring), separate judge context from generator context, and use multi-sample voting since a single weak-model judgment is noise.

**4. Course-correction machinery.**

- Structured feedback compilation: a layer that parses compiler/test/lint output into a minimal, localized, actionable message ("assertion on line 42 expected X got Y, relevant code is this 20-line window"). Weak models cannot do long-range credit assignment; feedback quality is the single biggest determinant of repair success.
- Sampling and selection: generate N candidates per step, score against the oracle stack, keep the best, optionally crossbreed (take the passing parts of two candidates). This is where you spend the weak model's cheapness — trade compute quantity for reasoning quality.
- Checkpoint/rollback on git: every verified green state is a checkpoint; when a repair loop degrades, revert rather than dig deeper. Weak models compound errors; rollback is cheaper than recovery.
- Stuck detection: detect repeated identical errors, oscillation between two states, or edit distance collapsing to zero across retries. On detection, escalate — change strategy, re-decompose the task, resample from scratch with a different plan, or hand to a stronger model/human.
- Role-separated critique loops: a reviewer persona with a checklist, separate context, and no access to the generator's rationalizations. Self-review in the same context is nearly worthless for weak models; they agree with themselves.

**5. Context and retrieval.** Weak models degrade faster with long context, so retrieval precision matters more than for a strong model. Tools: repo map / symbol index, semantic + exact code search, a "fact sheet" distiller that compresses relevant conventions and interfaces into a small pinned context, a scratchpad for working state, and — importantly — a **failure memory**: a log of what's been tried and why it failed, injected into retries so the model doesn't loop. Functional requirement: every generation call gets a curated, minimal context assembled by tools, never "here's the whole repo."

**6. Process orchestration.** A state machine that *enforces* the workflow rather than trusting the model to follow it: can't proceed to implementation without locked acceptance tests, can't mark done without green tests plus mutation threshold plus lint-clean, mandatory review stage, budget limits per stage. The workflow logic lives in deterministic code, not in the prompt. Weak models follow rails; they don't follow instructions reliably.

**7. Environment.** Hermetic, snapshot-able sandboxes with fast incremental builds and test selection (only run affected tests), so the inner loop is seconds not minutes. Iteration count is your substitute for intelligence, so inner-loop latency is a first-order concern, not an ops detail.

## Non-functional requirements

**Oracle integrity (Goodhart resistance).** The implementing agent must be physically unable to weaken the oracle: test files, lint configs, CI definitions, and golden snapshots are read-only from the agent's edit surface. Additionally, detect degenerate solutions — hardcoded outputs matching test inputs, deleted assertions, `# type: ignore` sprinkling, broadened exception swallowing. Weak models Goodhart *constantly* and unintentionally; a strong model gaming tests is malice, a weak model doing it is Tuesday. Mutation testing and held-out test splits (some acceptance tests never shown to the implementer) are your main defenses.

**Determinism of the harness.** Flaky tests are poison. A strong model can reason "this failure is unrelated to my change"; a weak model cannot, and will thrash trying to fix noise. Requirements: quarantine flaky tests automatically, pin seeds and clocks, retry-and-vote on ambiguous results, and treat harness nondeterminism as a P0 bug in the toolkit itself.

**Feedback locality.** Every failure signal delivered to the model must fit in a small window and point at a small code region. Measure this: if median repair-feedback size exceeds a few hundred tokens of relevant material, your compiler layer is failing.

**Cost model and parallelism.** Your economic thesis is (cheap model × many samples × cheap verification) ≥ (expensive model × one shot). That only holds if the harness supports wide parallel candidate evaluation and if you track **cost per verified unit of work** as the primary metric — not cost per token. Budget caps per task with automatic escalation when exceeded.

**Graduated escalation.** An explicit ladder: retry → resample → re-decompose → re-plan → stronger model → human. Every rung has a trigger condition and a budget. The system's value is knowing *when it doesn't know*, which the model itself can't tell you — the harness has to infer it from behavioral signals (stuck detection, oscillation, budget burn).

**Observability.** Full traces of every generation, verification result, and decision, both for human audit and because these traces are your dataset for improving prompts, rubrics, and eventually fine-tuning the weak model on its own verified successes.

**Composability.** Every tool speaks one interface: run(artifact) → {pass/fail, score, structured diagnostics}. This lets the orchestrator treat compilers, tests, mutation runs, and LLM judges uniformly and lets you add oracles without touching the loop.

## Mapping SDLC activities to manufactured fitness functions

This table is really the crux of adapting the AlphaEvolve mindset:

| Activity | Manufactured oracle |
|---|---|
| New feature | Pre-written locked acceptance tests + type checks + mutation-hardened unit tests |
| Bug fix | Mandatory failing reproduction test *before* any fix is attempted; fix = test flips green, nothing else flips red |
| Refactoring | Differential/equivalence testing against the old implementation, plus perf and complexity budgets |
| Test writing | Mutation kill rate + coverage delta + flakiness check (run 10×) |
| Code review | Decomposed into checklist queries against the diff, each answerable yes/no, plus static analysis findings — never "review this" holistically |
| Documentation | Doc-tests that execute examples, link checking, rubric-scored judge for prose |

The bug-fix row deserves emphasis: requiring a reproduction test first is the single most effective guardrail for weak-model debugging, because it converts an open-ended reasoning task into a search task with a binary signal.

## The honest caveats

Two things this architecture doesn't fix. First, spec-level errors: if the acceptance tests encode a misunderstanding of intent, the machinery will efficiently converge on the wrong thing — which is why the spec stage is where you should concentrate your scarce strong-model or human budget. Second, cross-cutting architectural judgment (is this the right abstraction? will this design scale?) has no execution oracle, and rubric-judging by a weak model gives you weak signal. Practical answer: constrain architecture via templates and conventions enforced by static rules, so the weak model operates inside a pre-made design rather than making design decisions.

If it'd be useful, a good next step would be picking one activity — I'd suggest bug fixing, since it has the cleanest oracle — and specifying the concrete state machine, tool interfaces, and budget parameters for it as a v1, then generalizing outward from there.