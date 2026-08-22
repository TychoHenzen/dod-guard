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

Treat migration as a sequence of user-directed slices. Preserve deliberate collaboration rules,
including mandatory check-ins. Replace only assumptions tied to an unavailable interface.

## 1. Inventory without editing

Run:

```bash
node <skill-directory>/scripts/scan-agent-setup.mjs <project-root>
```

Read every instruction file reported by the scanner. Follow references from those files to agent
definitions, skills, hooks, MCP configuration, and scripts. Do not treat a matching token as proof
that a change is needed.

When the project contains Claude agent definitions, generate project-scoped Codex agents with:

```bash
node <skill-directory>/scripts/convert-claude-agents.mjs \
  --source=<claude-agent-directory> --output=<project-root>/.codex/agents
```

Use `--check` with the same arguments to detect missing, stale, or unexpected generated agents.
Keep the Claude Markdown definitions canonical. Do not edit generated TOML by hand.

Classify each relevant item:

- `portable`: works in both environments unchanged.
- `claude-only`: depends on Claude syntax, paths, tools, or lifecycle behavior.
- `codex-only`: depends on Codex syntax, paths, tools, or lifecycle behavior.
- `shared-risk`: looks portable but has different discovery, precedence, or availability.

Show the input paths and the classified findings. Do not edit during inventory.

## 2. Propose the shared shape

Prefer `AGENTS.md` as the canonical shared instruction file. When Claude supports the import in
the target project, propose this complete `CLAUDE.md` adapter:

```md
@AGENTS.md
```

Do not replace `CLAUDE.md` until its unique instructions have moved to `AGENTS.md` or an explicit
Claude-only adapter. Keep tool-dependent wording capability-based when the behavior is shared.
Keep exact tool names inside environment-specific sections when their semantics differ.

Separate configuration by responsibility:

- Instructions describe judgment, collaboration, and project conventions.
- Skills describe reusable workflows.
- Hooks, rules, scripts, and CI enforce mechanical checks.
- MCP configuration connects external systems.

Present the proposed files, unresolved choices, and trade-offs. Ask which migration slice to apply.
Stop until the user answers.

## 3. Apply the approved slices

Change only the files covered by the user's answer. Preserve unrelated edits. If the user approves
several slices together, execute them continuously and verify each one. Do not request approval
between those slices. Do not broaden the work because another cleanup looks convenient.

For shared check-ins, preserve this contract:

- The user navigates. The agent builds.
- Pause before implementation and at every meaningful decision.
- Report discoveries that change the likely solution.
- Apply one agreed piece at a time.
- Verify the piece, show its concrete result, and ask what happens next.
- Use `AskUserQuestion` in Claude or `request_user_input` in Codex when available.
- If neither tool is available, end the turn with one concise question.

Never weaken this contract into autonomous implementation unless the user explicitly requests that
change. A request to apply all proposed slices is explicit authority to continue through them.

## 4. Verify the slice

Run the scanner again. Run project tests that cover changed scripts or configuration. Inspect the
diff for dropped instructions, duplicated sources of truth, unresolved environment names, and
accidental scope expansion.

For an instruction migration, verify both paths when their runtimes are available:

- Ask Codex to identify its active instruction sources and summarize the effective guidance.
- Ask Claude to show that `CLAUDE.md` imports the canonical guidance.

If one runtime is unavailable, state which verification remains unobserved. Do not infer it passed.

Report the changed files, scanner output, checks, and remaining findings. Ask about another slice
only when an unapproved slice remains.

## Boundaries

- Keep the process read-only until the first user decision.
- Do not delete Claude support unless the user chooses a Codex-only target.
- Do not rewrite working instructions merely to shorten them.
- Do not replace deliberate user control with model autonomy.
- Do not install plugins, alter global configuration, or change permissions without separate
  approval.
