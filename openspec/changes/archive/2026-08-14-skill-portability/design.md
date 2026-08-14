## Context

See proposal.md for motivation. The affected files are all SKILL.md prose, not TypeScript source. Each skill's SKILL.md is the prompt that Claude Code loads when the user invokes the skill.

Two patterns recur across the affected skills:

1. **Language-specific examples**: A generic instruction like "run the project's test command" is followed by an example that names `node --test`, `npm run build`, or a `packages/dod-guard/dist/` path. The instruction is correct, but the example anchors the reader (Claude) to a JS/TS project.
2. **Conversation-context inference**: Four opsx skills check whether the user mentioned a change earlier in the conversation before falling back to `openspec list --json`. The fallback works, but the "check conversation first" instruction means the skill behaves differently depending on session history.

## Goals / Non-Goals

**Goals:**

- Every skill works the same way regardless of the host project's language, build tool, or directory layout.
- Every opsx skill resolves its inputs from disk alone. Running it in a fresh session produces the same result as running it after another skill.

**Non-Goals:**

- Changing what any skill does. The behavior stays the same, only the prose and examples change.
- Adding new language-specific detection logic. opsx-init's project-context step will use the same lightweight detection for all stacks rather than adding deep support for each one.
- Changing any `.ts` source file or MCP tool.

## Decisions

**1. Replace language-specific examples with `<placeholder>` style, not multi-language tables.**

Each example will use angle-bracket placeholders like `<project-test-command>` instead of listing concrete commands for four languages. A multi-language table would be longer and still incomplete.

Alternative considered: Show one example per major language. Rejected because it makes each SKILL.md longer without helping Claude, which already knows how to run tests in any language once told the stack.

**2. Remove conversation-context inference entirely, do not replace it with a session file.**

The four opsx skills (apply, update, sync, archive) resolve the active change in three ways. They accept it as an argument, auto-select if one active change exists, or prompt the user. No session file, no memory, no conversation scanning.

Alternative considered: Write the last-used change name to a file (e.g., `.openspec-session`). Rejected because it introduces state that can go stale and is one more file to gitignore.

**3. opsx-init project detection becomes uniform across stacks.**

All stacks get the same lightweight treatment. Detect the manifest file, read the build and test commands from it, report them. Node loses its special-case depth. The skill already does this for non-Node stacks. Node just needs to lose its special-case depth.

## Risks / Trade-offs

- **Less specific examples may produce less specific output.** A concrete `node --test` example steers Claude toward the right command on a Node project. A placeholder requires Claude to figure out the test command from project context. Claude already reads the project manifest during the skill's context step. The placeholder makes the skill correct on non-Node projects where the concrete example was wrong.
- **Auto-select with one active change could surprise a user who forgot about an old change.** This is the existing fallback behavior. The only thing changing is that it fires immediately instead of after conversation-context inference fails, so the user sees the prompt sooner.
