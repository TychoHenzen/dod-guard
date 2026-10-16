---
name: codex-migrate
description: Audit and migrate a project whose agent setup targets Claude so it also works well with Codex. Use when the user asks to adopt Codex, share instructions between CLAUDE.md and AGENTS.md, translate Claude-specific tools or workflows, or assess agent configuration portability. Inventory first, request a decision before edits, apply every approved slice, and verify each slice. Do not request approval again between slices approved together.
---

# Codex Migrate

Read and apply `standards/working-defaults.md` from the plugin root (stricter skill boundaries win).

This skill makes a Claude-oriented project usable from Codex without breaking the Claude side. It looks first, proposes second, and edits only after the user decides.

## Collaboration rules

The user navigates and the agent builds. Keep that contract during the migration:

- Pause before implementation and at each meaningful decision.
- Report any discovery that changes the likely solution.
- Apply one agreed piece at a time, verify it, show the result, and ask what comes next.
- Ask with `AskUserQuestion` in Claude or `request_user_input` in Codex. When neither tool exists, end the turn with one concise question.
- Never weaken these rules to autonomy unless the user asks. A request to apply all slices counts as that explicit authority.

Keep deliberate collaboration rules found in the project, such as check-ins. Replace only the assumptions tied to an interface that the other runtime lacks. Never replace deliberate user control with model autonomy.

## Boundaries

- Stay read-only until the user makes the first decision.
- Do not delete Claude support unless the user picks a Codex-only target.
- Do not rewrite working instructions only to shorten them.
- Do not install plugins, change global config, or change permissions without separate approval.

## Step 1: Inventory (read-only)

Run the scanner on the project root:

```text
node <skill-directory>/scripts/scan-agent-setup.mjs <project-root>
```

Read every instruction file the scanner reports. Follow each reference to agents, skills, hooks, MCP config, and scripts. A matching token alone proves nothing, so open the target before you classify it.

Label each finding with one of these:

- `portable`: works in both runtimes as written.
- `claude-only`: depends on a Claude feature or tool that Codex lacks.
- `codex-only`: depends on a Codex feature that Claude lacks.
- `shared-risk`: reads as shared but means different things in each runtime.

`claude-only` means it depends on Claude syntax, paths, tools, or lifecycle behavior; `codex-only` means the same for Codex. `shared-risk` means the runtimes differ in discovery, precedence, or availability.

Show the user the input paths and the classified findings.

## Step 2: Propose, then stop

Write a proposal that lists:

- the files you would touch,
- the choices still unresolved,
- the trade-offs of each,
- which slice you suggest applying first.

Ask which slice to apply. Stop until the user answers. Make no edit before then.

## Design guidance for the proposal

- Prefer `AGENTS.md` as the canonical shared file. Replace `CLAUDE.md` with the adapter only when Claude supports the import and the unique instructions have moved first. The adapter is the single line `@AGENTS.md`. Do not replace `CLAUDE.md` until its unique instructions have moved to `AGENTS.md` or an explicit Claude-only adapter.
- Where behavior is shared, word tool references by capability. Where the semantics differ, keep the exact tool names in environment-specific sections.
- Separate configuration by responsibility:
  - instructions hold judgment and conventions,
  - skills hold workflows,
  - hooks, rules, scripts, and CI hold mechanical checks,
  - MCP holds external systems.

## Step 3: Apply approved slices

Apply only what the answer covers. Preserve unrelated edits. Slices the user approved together run one after another without new approval, and you verify each one. Do not widen the scope.

### Agents

Generate Codex agents only when the project contains Claude agent definitions. Claude agent Markdown stays the canonical source. The converter generates Codex agents from it:

```text
node <skill-directory>/scripts/convert-claude-agents.mjs --source=<claude-agent-directory> --output=<project-root>/.codex/agents
```

The result is `.codex/agents/*.toml`. Never edit a generated TOML file by hand. Change the Markdown and run the converter again.

Add `--check` to the same command to report generated agents that are missing, stale, or unexpected.

## Step 4: Verify each slice

- Rerun the scanner.
- Run the project tests that cover any changed script or config.
- Inspect the diff for dropped instructions, duplicate sources of truth, unresolved environment names, and scope expansion.
- For an instruction migration, check both runtimes when they are available. In Codex, check the active instruction sources and the effective guidance. In Claude, check that `CLAUDE.md` imports the canonical file.
- When a runtime is unavailable, say what you did not observe. Do not infer a pass.

## Final report

Report the changed files, the scanner output, the checks you ran, and the remaining findings. Ask about another slice only if an unapproved slice remains.
