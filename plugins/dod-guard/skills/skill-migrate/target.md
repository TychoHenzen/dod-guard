# The Complete Checklist: Skills, CLAUDE.md, and Agentic Workflows for Claude Opus 5, Sonnet 5, and Fable 5

## TL;DR
- **Write less, not more.** The single biggest shift across Opus 5, Sonnet 5, and Fable 5 is that they are smarter, more agentic, and more literal — so the winning move is to *delete* scaffolding (verification loops, "double-check your work," forced status updates) and keep SKILL.md/CLAUDE.md concise (target ~200 lines or fewer for CLAUDE.md, under 500 lines for SKILL.md), because bloated instruction files cause the models to ignore your most important rules.
- **Control behavior with the right lever.** Use the `effort` parameter for reasoning depth/cost (not verbosity), explicit prompt instructions for response length and scope, progressive disclosure for skills, and hooks (not CLAUDE.md prose) for anything that must happen deterministically every time.
- **The models changed; re-tune your prompts.** Opus 5 defaults to longer output and readily self-verifies and spawns subagents; Sonnet 5 is more literal and rejects `temperature`/`top_p`; Fable 5 runs for hours, refuses reasoning-extraction instructions, and needs grounded progress-auditing. Old prompts still work but are now suboptimal — re-run an effort sweep and audit for removable scaffolding.

## Key Findings

**The current model landscape (as of August 7, 2026).** Anthropic's lineup now includes a frontier "Mythos-class" tier above Opus. Claude Fable 5 (the generally available Mythos-class model, `claude-fable-5`) and its less-restricted sibling Claude Mythos 5 launched June 9, 2026. Claude Sonnet 5 (`claude-sonnet-5`) launched June 30, 2026, and Claude Opus 5 (`claude-opus-5`) launched July 24, 2026. Opus 5 is priced at $5/$25 per million input/output tokens (same as Opus 4.8), comes close to Fable 5's frontier intelligence at half the price, and is Anthropic's most-aligned model to date (scoring 2.3 on its automated behavioral-audit misalignment metric). Fable 5 carries hard safety classifiers (offensive cyber, biology/life sciences, and reasoning-extraction) that fall back to Opus 4.8. All three are supported by dedicated Anthropic prompting guides — this report is built primarily on those official pages plus the Claude Code/Skills docs and Anthropic's engineering blog.

**Agent Skills are now an open standard.** Anthropic launched Agent Skills on October 16, 2025 ("Equipping agents for the real world with Agent Skills"), and published the SKILL.md spec as an independent open standard at agentskills.io on December 18, 2025, with a specification and reference SDK. It has since been adopted by 26+ platforms — including OpenAI Codex, Gemini CLI, Cursor, and VS Code — with roughly 40 skills-compatible products listed on the official agentskills.io showcase as of June 2026. The core design principle is **progressive disclosure**: only each skill's `name` + `description` (~100 tokens) preload into context; the SKILL.md body loads when triggered; bundled files/scripts load only when needed.

**Everything traces back to context economics.** Anthropic's context-engineering guidance ("Effective context engineering for AI agents," Sep 29, 2025) frames the context window as a finite resource subject to "context rot" — recall degrades as tokens accumulate. Every best practice below is downstream of that single constraint: the goal is the *smallest set of high-signal tokens* that reliably produces the desired behavior.

---

## Details

### PART 1 — Claude Code Skills (SKILL.md files)

**DO:**
- **Keep the SKILL.md body under 500 lines** (Anthropic's stated optimal ceiling); some practitioners target ~300 lines for the most reliable performance. Split overflow into separate reference files.
- **Write the `description` for the dispatcher, not the human.** It is the single most important design decision — Claude decides whether to load a skill based *solely* on `name` + `description`. Include both *what the skill does* and *when to use it*, with specific trigger phrases and file types. The "even if they don't explicitly say X" pattern is particularly effective because Claude tends to *undertrigger*.
- **Always write descriptions in third person** ("Processes Excel files…" not "I can help you…"). The description is injected into the system prompt and inconsistent point-of-view causes discovery problems.
- **Respect the frontmatter rules** (confirmed verbatim in the Claude Platform Docs Agent Skills overview): `name` maximum 64 characters, lowercase letters/numbers/hyphens only, no XML tags, no reserved words ("anthropic", "claude"); `description` must be non-empty, maximum 1,024 characters, no XML tags. Prefer gerund naming (`processing-pdfs`, `analyzing-spreadsheets`).
- **Use progressive disclosure with one-level-deep references.** All reference files should link directly from SKILL.md; avoid nested references (SKILL.md → advanced.md → details.md), because Claude may only partially read deeply nested files (e.g., using `head -100`).
- **Add a table of contents to reference files longer than 100 lines** so Claude sees the full scope even on partial reads.
- **Set the right "degrees of freedom":** high freedom (text instructions) when many approaches are valid; low freedom (specific scripts, no parameters) when operations are fragile and consistency is critical. Anthropic's analogy: narrow bridge with cliffs = exact instructions; open field = general direction.
- **Build evaluations first.** Anthropic recommends creating at least three evaluation scenarios and measuring a baseline *before* writing extensive docs, then iterating. Use the "Claude A builds the skill / Claude B tests it in a fresh session" loop.
- **Test the skill with every model you'll run it on** (Haiku/Sonnet/Opus/Fable). What is perfectly concise for Opus may need more detail for Haiku.
- **For scripts:** solve, don't defer (handle errors in the script rather than punting to Claude); avoid "voodoo constants" (justify every magic number); use forward slashes in all paths; list required packages; prefer pre-made utility scripts over generated code.
- **Use MCP tools with fully-qualified names** (`ServerName:tool_name`) to avoid "tool not found" errors.
- **Repeat critical rules in every subagent prompt.** When a skill launches subagents, each starts with a blank context and does not inherit the parent conversation — include all necessary context inline.
- **Restart the session after installing a skill.** Descriptions are collected at session start, so a mid-session install is invisible until restart — this is the single most common reason a "broken" skill isn't firing.

**DON'T:**
- **Don't over-explain.** Default assumption: Claude is already very smart. Challenge each sentence: "Does Claude already know this?" A ~50-token concise version beats a ~150-token tutorial.
- **Don't write vague descriptions** ("Helps with documents," "Does stuff with files") — a skill with a bad description is invisible.
- **Don't offer too many options.** Provide one default with an escape hatch, not "you can use pypdf, or pdfplumber, or PyMuPDF, or…".
- **Don't include time-sensitive info** ("before August 2025, use…"); use a collapsible "old patterns" section instead.
- **Don't use inconsistent terminology** — pick one term ("API endpoint," "field," "extract") and stick with it.
- **Don't use `@` imports in SKILL.md** — they're only resolved in CLAUDE.md files. Use Read-tool instructions instead.
- **Don't create cross-skill dependencies** — each skill should be fully self-contained.
- **Watch the skill-listing context budget.** The combined skill listing has a limited context budget (roughly 1% of the context window per community reports); when it overflows, Claude Code silently drops descriptions, starting with least-used skills — a brand-new skill goes mute first. Diagnose with `/doctor` and `--debug` before rewriting.
- **Beware YAML/formatting breakage:** a stray colon or a Prettier reformat can break the frontmatter. Keep the description on one logical line; consider a `# prettier-ignore` comment.
- **For Fable 5 specifically, don't over-prescribe.** Anthropic warns that skills developed for prior models are "often too prescriptive for Claude Fable 5 and can degrade output quality" — review and remove older instructions if default performance is better.

### PART 2 — CLAUDE.md / project configuration files

**DO:**
- **Keep it short.** Anthropic's Claude Code docs say to keep CLAUDE.md concise; community consensus and the docs point to a practical target of ~200 lines or fewer (some teams go to ~60), with compliance dropping sharply past ~200–300 lines. For each line ask: "Would removing this cause Claude to make a mistake?" If not, cut it.
- **Include what Claude can't infer:** non-obvious bash commands, code style that differs from defaults, test runners, repo etiquette (branch naming, PR conventions), architectural decisions, environment quirks/required env vars, and common gotchas.
- **Use the memory hierarchy:** `~/.claude/CLAUDE.md` (all sessions), `./CLAUDE.md` (project, check into git), parent/child directory files (monorepos). `CLAUDE.local.md` is deprecated in favor of `@`-imports (which work better across git worktrees).
- **Use `@path` imports** to keep the root file lean (relative or absolute paths; recursive imports up to ~5 hops; not evaluated inside code spans). Note the tradeoff: imports help organization but don't reduce context, since imported files load at launch.
- **Use emphasis markers (`IMPORTANT`, `YOU MUST`) sparingly** — Anthropic's docs confirm these improve adherence, but reserve them for the one or two genuinely critical rules.
- **Write negative rules with a path forward.** "Never use console.log; use src/utils/logger.ts" beats a bare "Never use console.log," which can make Claude freeze.
- **Scope narrow rules to where they apply.** Use `.claude/rules/*.md` with `paths` frontmatter (glob patterns) so API-only rules load only when Claude touches matching files, keeping the root file lean.
- **Define a glossary** for internal jargon/acronyms — Claude interprets unknown terms unpredictably.
- **Run `/init`** to generate a starter file, `/context` to confirm it loaded, and `/memory` to edit. Use the `/doctor` checkup (v2.1.206+) to trim content Claude can derive from the codebase while keeping pitfalls, rationale, and conventions.
- **Treat CLAUDE.md like code:** give it one owner, review it when things go wrong, prune regularly, and test changes by observing whether behavior actually shifts. Check it into git so the team benefits — it compounds in value.
- **Know the persistence behavior:** project-root CLAUDE.md survives compaction (re-read from disk after `/compact`); managed-policy CLAUDE.md cannot be excluded.

**DON'T:**
- **Don't build a kitchen sink.** The "over-specified CLAUDE.md" is an official Anthropic-listed failure pattern: if the file is too long, Claude ignores half of it because important rules (often at the bottom) get lost in the noise.
- **Don't duplicate the linter/formatter.** Rules already enforced by tooling are noise — enforce with code (or hooks) where you can.
- **Don't include anything Claude can figure out by reading code** (directory layouts, dependency lists, file-by-file descriptions), detailed API docs (link instead), frequently-changing info, or self-evident advice ("write clean code").
- **Don't let rules contradict.** If two rules conflict, Claude may pick one arbitrarily — periodically review nested/subdirectory files and `.claude/rules/`.
- **Don't rely on local-only memory for shared policy** — if the next person needs it, put it in a versioned file. Note: Claude Code does not read AGENTS.md directly; if your repo uses one, import it via `@AGENTS.md`.
- **Don't confuse the two memory types:** *you* write CLAUDE.md (the "constitution"); Claude writes auto-memory (the "case law," stored in `~/.claude/projects/<project>/memory/`). Only the first 200 lines of `MEMORY.md` load at startup; explicit CLAUDE.md instructions win on conflict. Prune stale auto-memory with `/memory` — wrong memory is worse than none.

### PART 3 — Agentic workflows and agents

**Foundational principles** (from Anthropic's "Building effective agents," Dec 19, 2024, and "Effective context engineering for AI agents," Sep 29, 2025):
- **Use agents selectively.** Agents suit open-ended problems where you can't hardcode a fixed path and you can tolerate higher cost and compounding errors. For predictable tasks, use workflows (prompt chaining, routing, orchestrator-workers, evaluator-optimizer) — or don't use an agent at all. Start simple; add complexity only when it demonstrably improves outcomes.
- **Get the system prompt to the "right altitude":** the Goldilocks zone between brittle hardcoded if-else logic and vague high-level guidance. Organize with XML tags or Markdown headers (`<background_information>`, `<instructions>`, `## Tool guidance`). Minimal ≠ short — give sufficient info, but only high-signal tokens.
- **Treat context as finite** ("context rot"/attention budget). Curate system prompts, tools, examples, and message history down to the smallest high-signal set. Use subagents for investigation so exploration doesn't pollute the main context.

**Tool design** (from Anthropic's "Writing effective tools for agents — with agents," Sep 11, 2025):
- **Build a few thoughtful tools for high-impact workflows**, not thin wrappers around every API endpoint. Verbatim: *"More tools don't always lead to better outcomes."*
- **Consolidate functionality.** Prefer `schedule_event` over separate `list_users`/`list_events`/`create_event`; prefer `search_logs` over `read_logs`; prefer `get_customer_context` over three separate lookups. Each tool should have a clear, distinct purpose — "If a human engineer can't definitively say which tool should be used, an AI agent can't be expected to do better."
- **Namespace tools** by service/resource (`asana_search`, `asana_projects_search`) to delineate boundaries. Prefix- vs suffix-based namespacing has non-trivial, LLM-dependent effects — choose per your own evals.
- **Return high-signal context.** Eschew low-level identifiers (`uuid`, `mime_type`); return `name`, `file_type`, etc. Resolving arbitrary UUIDs to semantic names (or a 0-indexed scheme) significantly improves retrieval precision and reduces hallucination.
- **Optimize for tokens:** implement pagination, range selection, filtering, and truncation with sensible defaults. Verbatim: *"For Claude Code, we restrict tool responses to 25,000 tokens by default."* Expose a `response_format` enum (`"concise"` vs `"detailed"`).
- **Prompt-engineer tool descriptions like onboarding a new hire** — make implicit context explicit, name parameters unambiguously (`user_id` not `user`). Make error responses specific and actionable, not opaque tracebacks.
- **Improve tools with an evaluation-driven, agent-assisted loop:** prototype → generate realistic eval tasks (each potentially requiring dozens of tool calls) with verifiable outcomes → run programmatically → analyze metrics (runtime, tool-call count, token consumption, errors) → let Claude Code analyze transcripts and refactor tools. Verbatim: *"We recommend collaborating with an agent to help analyze your results and determine how to improve your tools."* Use held-out test sets to avoid overfitting.

**Long-running agents** (from "Effective harnesses for long-running agents," Nov 26, 2025):
- The core challenge: agents work in discrete sessions, each starting with no memory — "like a software project staffed by engineers working in shifts." Compaction alone is insufficient.
- Use a **two-phase harness**: an **initializer agent** (runs once) sets up an `init.sh`, a `claude-progress.txt` log, an initial git commit, and a comprehensive **feature-list JSON** (each feature marked `passes: false`); then a **coding agent** makes **incremental progress on one feature at a time**, commits to git with descriptive messages, and updates the progress file. (These are the same model/harness with different initial prompts.)
- **Enforce a "clean state"** each session (mergeable-quality code, no major bugs, documented). Have the coding agent get its bearings first (`pwd`, read progress/git logs, read the feature list, run `init.sh`, run a basic end-to-end test). Use JSON for the feature list (the model is less likely to overwrite it than Markdown) and strongly-worded instructions against editing/removing tests ("It is unacceptable to remove or edit tests").
- **Verify like a human user** (e.g., browser automation such as the Puppeteer MCP) — Claude tends to mark features done without proper end-to-end testing unless explicitly prompted.

**Subagents / delegation (Claude Code):**
- Define specialists in `.claude/agents/` (project, committed) or `~/.claude/agents/` (user). Only `name` and `description` are required; the body is the subagent's entire system prompt.
- **The `description` is the trigger, not a label** — write it as a routing rule; add "use PROACTIVELY"/"MUST BE USED" to encourage auto-delegation.
- **Scope tools tightly** (a reviewer probably shouldn't have Write). Subagents run in isolated context and report summaries back, keeping the main conversation clean.
- **Use subagents for isolated work within one session; use parallel sessions/agent teams for unrelated workstreams.** Subagents cannot spawn other subagents — orchestration lives in the parent. A fresh-context reviewer catches what the writer misses (Writer/Reviewer pattern).
- **Add an adversarial review step, but constrain it:** a reviewer told to find gaps will always report some. Tell it to flag only gaps affecting correctness or stated requirements, else you get over-engineering.

**Verification and safety:**
- **Give Claude a way to verify its own work** (tests, build exit code, linter, screenshot diff). This is the difference between a session you watch and one you can walk away from. Escalate gating from in-prompt → `/goal` condition → Stop hook (deterministic; Claude Code overrides after 8 consecutive blocks) → second-opinion subagent.
- **Use hooks for anything that must happen every time** — hooks are deterministic; CLAUDE.md instructions are advisory.
- **Configure permissions deliberately:** auto mode (classifier-gated), allowlists, or OS-level sandboxing for unattended runs.
- **Test in sandboxed environments with guardrails** — agent autonomy means higher cost and compounding-error risk.

### Model-specific behavioral changes and tuning

**Claude Opus 5 (built for long-horizon agentic coding; thinking on by default):**
- **Remove verification/self-correction scaffolding.** Opus 5 verifies its own work and catches its own mistakes; instructions like "include a final verification step," "use a subagent to verify," or "double-check your answer" cause *over-verification* and waste tokens with no quality gain. This is the single biggest reported win on migration.
- **Control length by prompting, not effort.** Opus 5's default responses (and files it writes to disk) run longer than prior Opus models. `effort` controls *thinking*, not output length — add an explicit conciseness instruction and a length-calibration instruction for written deliverables.
- **Constrain scope explicitly** for narrow tasks — Opus 5 can expand scope and apply its own judgment about what the task "should" be.
- **Cap subagent delegation.** Opus 5 delegates readily; delegation pays off only for genuinely independent, sizeable tracks — set deterministic caps and don't use subagents to double-check its own work.
- **Start at `high` (the default) and use `low`/`medium` liberally**; step up to `xhigh` for demanding work. This *reverses* the Opus 4.7/4.8 advice to start at `xhigh`. Re-run an effort sweep on migration. One legal-tech tester reported similar quality with 26% fewer tokens vs Opus 4.8 at max reasoning.
- **Keep thinking enabled.** Disabling thinking (only allowed at `high` effort or below) can cause tool calls to leak as plain text and internal XML tags to appear. Don't add a system-prompt rule telling the model "not to think" — it *increases* tag leakage.
- Has a **1M-token context window** (default and max), with consistent instruction-following throughout.

**Claude Sonnet 5 (most agentic Sonnet yet; adaptive thinking on by default):**
- **`temperature`, `top_p`, and `top_k` now return a 400 error** — remove them and steer tone/variety via the system prompt instead. This is new for Sonnet-class models.
- **Manual extended thinking is removed** (`thinking: {type:"enabled", budget_tokens:N}` → 400 error). Use adaptive thinking + `effort`.
- **New tokenizer produces ~30% more tokens** for the same text — revisit `max_tokens` limits tuned for 4.6 or risk truncation (`stop_reason: "max_tokens"`).
- **More literal instruction following**, especially at low effort — it won't silently generalize an instruction from one item to all items. State scope explicitly ("apply to every section, not just the first").
- **More agentic/reaches for tools more readily**; with thinking disabled it's *less* likely to use tools — add an explicit nudge. Remove old "summarize progress every 3 tool calls" scaffolding.
- **Effort mapping:** Sonnet 5 at `medium` ≈ Sonnet 4.6 at `high`; Sonnet 5 at `high` ≈ Sonnet 4.6 at `max`. Default is `high`; use `xhigh` for hardest coding/agentic work.
- **Code-review harnesses may show lower recall** — not a regression, but literal compliance with "only report high-severity issues." Instruct it to report everything and filter in a separate pass.
- **May settle into a default "house" visual style** on frontend briefs — specify a concrete alternative or have it propose options first (since `temperature` variety is unavailable).

**Claude Fable 5 (frontier long-horizon autonomy; adaptive thinking only):**
- **Individual requests can run for many minutes; autonomous runs for hours.** Adjust client timeouts, streaming, and progress indicators; consider async/scheduled checking rather than blocking.
- **Steer with brief instructions, not enumerated rules** — instruction-following is strong enough that a short brevity/scope instruction replaces long lists.
- **Ground progress claims:** instruct it to audit each progress claim against an actual tool result from the session — this nearly eliminated fabricated status reports in Anthropic's testing.
- **Audit skills/prompts for reasoning-extraction instructions.** Prompts that tell the model to echo, transcribe, or explain its internal reasoning can trigger the `reasoning_extraction` refusal category and cause elevated fallbacks to Opus 4.8. Read structured `thinking` blocks instead.
- **Use parallel subagents freely** with async communication; long-lived subagents save cost via cache reads. Fresh-context verifier subagents outperform self-critique.
- **Build a memory system** (as simple as one lesson per Markdown file) — Fable 5 performs particularly well when it can record and reference lessons from prior runs.
- **State boundaries explicitly** — it can take unrequested actions (drafting emails, creating defensive git branches). Add autonomous-operation reminders for pipelines ("the user is not watching… proceed without asking for reversible actions").
- **Don't surface context-budget countdowns** — showing remaining tokens can make it suggest a new session or trim its work. Add reassurance if unavoidable.
- **Create a `send_to_user` tool** for long async agents to surface verbatim content mid-turn (tool inputs are never summarized). Pair it with an elicitation instruction or the model rarely calls it.
- **Use `high` as the default, `xhigh` for hardest work; `low`/`medium` still often beat prior-gen `xhigh`.** Add anti-over-engineering instructions at higher effort ("don't add features, refactor, or introduce abstractions beyond what the task requires").
- **Start at the top of your difficulty range** — testing Fable 5 only on easy workloads undersells it.

### The `effort` parameter (all current models)
Five levels, lowest to highest reasoning: `low`, `medium`, `high` (the default), `xhigh`, `max`. Effort is *soft guidance* — the model still decides per-request whether to think. Key rules: effort controls *thinking depth/cost*, not output length; thinking counts toward `max_tokens`, so at `high`+ leave headroom or you'll see truncated answers; effort defaults are model-specific, so **re-run an effort sweep whenever you migrate** rather than carrying over an old default. In Claude Code, set it with `/effort <level>` or `--effort` (low/medium/high persist across sessions; max resets at session end).

---

## Recommendations

**Stage 1 — Audit and delete (do this first, highest ROI).**
1. Cut every CLAUDE.md down toward ~200 lines; run `/doctor` to strip codebase-derivable content and duplicated linter rules. Add a glossary for internal jargon.
2. Remove verification/self-correction/forced-progress scaffolding from all prompts, skills, and harnesses — these actively hurt Opus 5, Sonnet 5, and Fable 5.
3. Audit skills and system prompts for "show/echo your reasoning" instructions before running Fable 5 (they trigger refusals).
4. Remove `temperature`/`top_p`/`top_k` and any manual `budget_tokens` from Sonnet 5 calls (they now 400).

**Stage 2 — Re-tune for the new models.**
1. Re-run an `effort` sweep on your own evals for each model (start Opus 5 at `high`, not `xhigh`; check `max_tokens` headroom given the reasoning budget and Sonnet 5's ~30%-larger tokenization).
2. Add explicit response-length, narration-cadence, and scope instructions where product UX needs tighter defaults than the models now ship.
3. Rewrite skill and subagent `description` fields as routing rules with real trigger phrases; verify triggering in fresh sessions (should-fire and should-NOT-fire prompts) and restart after installs.

**Stage 3 — Build for autonomy.**
1. Give every agent a machine-checkable verification signal; gate long runs with `/goal` conditions or Stop hooks and a fresh-context adversarial reviewer.
2. For multi-session work, adopt the initializer/coding-agent harness with `claude-progress.txt`, a git baseline, and a `passes:false` feature-list JSON.
3. Consolidate tools into a few high-impact, namespaced tools with token-efficient responses (respecting the 25,000-token default cap); run the agent-assisted eval loop to refine them.
4. Move anything that must happen deterministically from CLAUDE.md prose into hooks.

**Benchmarks/thresholds that should change your approach:**
- If Claude ignores a CLAUDE.md rule → the file is too long; prune or convert to a hook/scoped rule.
- If a skill never fires → check session restart and the description first, then the skill-listing budget via `/doctor`, before rewriting the body.
- If you correct the same issue twice in a session → `/clear` and re-prompt rather than accumulating polluted context.
- If a reviewer subagent floods you with findings → constrain it to correctness/requirement gaps only.
- If output is truncated (`stop_reason: max_tokens`) → raise `max_tokens` or drop effort.

## Caveats
- **Model names and dates:** The Fable 5 / Mythos 5 / Sonnet 5 / Opus 5 release dates, pricing, and behaviors are drawn from Anthropic's own launch posts and prompting guides; some corroborating detail comes from third-party write-ups that may contain errors. Fable 5 had a brief export-control suspension (June 12–30, 2026) before global redeployment — availability specifics can change, so verify against Anthropic's docs before production decisions.
- **Benchmark figures** cited in launch materials (Frontier-Bench, CursorBench, etc.) are largely Anthropic-run or early third-party numbers; treat superlatives ("state-of-the-art," "close to Fable") as vendor claims until independently verified.
- **Line-count targets** (200 for CLAUDE.md, 500 for SKILL.md) are guidance, not hard limits; the underlying principle (minimize high-signal tokens) matters more than any specific number, and optimal length is model- and task-dependent. The ~1%-of-context skill-listing budget is a community-reported figure, not an official published number.
- **Community sources** (DEV.to, Medium, individual blogs) are useful for real-world failure patterns but are not authoritative; where they conflict with Anthropic docs, defer to the docs.
- **Fast-moving area:** Claude Code features (auto memory, `/doctor` trims, agent teams, effort persistence) are evolving and partly gated by version/rollout; confirm availability in your version.