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

1. Run `node <skill-directory>/scripts/scan-agent-setup.mjs <project-root>`.
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

- Re-run the scanner and project tests covering changed files.
- Inspect the diff for dropped instructions, duplicate sources of truth, unresolved environment names, and scope creep.
- Ask Codex to name its active instruction sources and summarize guidance; ask Claude to show `CLAUDE.md` imports it. If a runtime is unavailable, say what went unobserved; never infer a pass.
- Report changed files, scanner output, checks, and remaining findings. Ask again only if an unapproved slice remains.

## Never

- Delete Claude support unless the user picks a Codex-only target.
- Rewrite working instructions merely to shorten them.
- Install plugins, alter global config, or change permissions without separate approval.
