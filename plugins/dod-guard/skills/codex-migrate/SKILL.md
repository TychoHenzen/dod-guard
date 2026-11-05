---
name: codex-migrate
description: >-
  Audit and migrate a project whose agent setup targets Claude so it also works well with Codex.
  Use when the user asks to adopt Codex, share instructions between CLAUDE.md and AGENTS.md,
  translate Claude-specific tools or workflows, or assess agent configuration portability.
  Inventory first, request a decision before edits, apply every approved slice, and verify each
  slice. Do not request approval again between slices the user approved together.
---

# Codex Migrate

Read and apply `standards/working-defaults.md` from the plugin root; where this skill is stricter, it wins. Migration is user-directed slices. Keep deliberate collaboration rules, including check-ins. Replace only assumptions tied to an unavailable interface.

## Inventory (read-only)

1. Run `node <skill-directory>/scripts/scan-agent-setup.mjs <project-root> --json` and save the output outside the project as the baseline. It exits 0 with findings present, 1 on a read error, 2 on a usage error; on 1 or 2 follow the failure rule under Verification.
2. Read every reported instruction file. Follow references into agents, skills, hooks, MCP config, and scripts. A matching token alone never proves a change is needed.
3. For Claude agent definitions, generate Codex agents:
   ```bash
   node <skill-directory>/scripts/convert-claude-agents.mjs \
     --source=<claude-agent-directory> --output=<project-root>/.codex/agents
   ```
   `--check` detects missing, stale, or unexpected agents. Claude Markdown stays canonical; never hand-edit generated TOML.
4. Classify each item: `portable` (works in both), `claude-only` or `codex-only` (tied to that environment), `shared-risk` (looks portable, differs in discovery, precedence, or availability).
5. Show the user paths and findings.

## Proposal

- Prefer `AGENTS.md` as the shared file. Where Claude supports imports, propose a `CLAUDE.md` holding only:
  ```md
  @AGENTS.md
  ```
- Move unique `CLAUDE.md` content to `AGENTS.md` or a Claude-only adapter first.
- Word shared behavior by capability; keep tool names in environment sections.
- Put judgment in instructions, workflows in skills, mechanical checks in hooks, rules, scripts, or CI, and external systems in MCP config.
- Present files, open choices, and trade-offs. Ask which slice to apply, then stop.

## Applying

Change only files the answer covers, keep unrelated edits, and do not widen scope. Run slices approved together back to back; "apply all" authorizes that.

Migrated instructions keep the check-in contract: the user navigates, the agent builds. Pause before implementing and at each meaningful decision. Report discoveries that change the solution. Apply one agreed piece at a time, verify it, show the result, and ask what next. Ask with `AskUserQuestion` (Claude) or `request_user_input` (Codex); with neither, end the turn with one concise question. Never weaken this into autonomy unless the user asks.

## Verification (each slice)

Run each check as a command and read its result. Never infer a pass.

1. Rerun `scan-agent-setup.mjs <project-root> --json` and compare its findings with the baseline, only for files the slice changed.
   - A slice that removes or rewords environment-specific text must lower the count of its target signals in those files. If the count did not drop, the slice is unfinished.
   - A slice that only moves content, such as into `AGENTS.md`, may add signals at the destination. Require that the signals removed from the source equal the signals added, and that nothing else changed.
   - A slice that reduces `CLAUDE.md` must leave `claudeAdapter` reading `canonical`.
   - Regenerated `.codex/agents/*.toml` files are scanned too, so a changed count there is expected, not a failure.
2. When the slice touched agent definitions, run `node <skill-directory>/scripts/convert-claude-agents.mjs --check --source=<claude-agent-directory> --output=<project-root>/.codex/agents`. It must exit 0.
3. Run the test command the project documents in `AGENTS.md` or `CLAUDE.md`. It must exit 0. When none is documented, say so in the report and do not claim a pass.
4. Inspect the diff for dropped instructions, duplicate sources of truth, unresolved environment names, and scope creep.
5. Ask Codex to name its active instruction sources and summarize guidance; ask Claude to show `CLAUDE.md` imports it. If a runtime is unavailable, say what went unobserved; never infer a pass.
6. Report changed files, scanner output, checks, and remaining findings. Ask again only if an unapproved slice remains.

Script failure. If the scanner or the converter exits non-zero, report its stderr and stop that slice; leave other approved slices running. The scanner exits 1 on a read error and 2 on a usage error. The converter exits 1 on drift (`missing`, `stale` or `unexpected` on stderr) and also on any thrown error such as an unknown argument or a missing agent field. If `--check` shows drift, run the converter without `--check` once, then run `--check` again. If drift remains, stop the slice and report it. Never edit the TOML to make it pass.

## Never

- Delete Claude support unless the user picks a Codex-only target.
- Rewrite working instructions merely to shorten them.
- Install plugins, alter global config, or change permissions without separate approval.
- Overwrite an existing `AGENTS.md` before moving its unique content into the slice's plan and showing it to the user.
- Delete `CLAUDE.md`; reduce it to the one-line `@AGENTS.md` import instead.
- Hand-edit generated agent TOML (see Inventory item 3).
