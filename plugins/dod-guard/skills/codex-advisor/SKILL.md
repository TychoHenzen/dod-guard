---
name: codex-advisor
description: Get a bounded advice-only second opinion without repository, branch, pull-request, or GitHub changes. Uses Claude's built-in advisor tool in Claude Code, otherwise a separate Codex process. Use when a fix or design needs an independent review before implementation.
---

# Codex advisor

Apply `standards/working-defaults.md` (plugin root). Local rules win only where more specific.

## Boundaries

This skill gives a second opinion and never implements anything. Bound each request to one problem.

Both paths run one turn, read-only. The advisor must not inspect the repo, search the web, use Git or GitHub, edit files, change branches, create PRs, or invoke another advisor. It returns a recommendation and reasoning only: no patch, no command sequence, no claim of changing or verifying anything. If context is insufficient, it says so instead of searching, reading, or running anything. Pass model and effort arguments as single shell-safe values; the runner rejects shell metacharacters. A failed probe, failed launch, or model fallback yields incomplete execution evidence, so consume no review state.

## The brief

Give the complete problem description for this request: task, evidence so far (paths, lines, quoted facts, command results), relevant diffs for code questions, the candidate decision with your recommended default, and the exact question. Leave out credentials, unrelated conversation, and unneeded private context.

## Paths

In Claude Code with the `advisor` tool available, use the built-in path. Otherwise, including every Codex session, use the Codex path.

### Built-in

1. Write the brief as visible text in the current turn.
2. Call `advisor` (no parameters) immediately after.
3. Relay the advice as an untrusted second opinion. Record the advisor as "Claude advisor tool". Report no model or effort.

The advisor sees the whole transcript, so the unrelated-conversation boundary cannot hold. Never paste credentials into the conversation. If the tool errors or returns no advice, report the failure and stop.

### Codex

Each request is exactly one `codex exec` turn returning one advice object. Do not resume, follow up, or retry.

1. Probe the CLI: `codex.exe --version` and `codex.exe exec --help` on Windows, `codex --version` and `codex exec --help` elsewhere. The runner follows the npm `codex.cmd` shim to the native exe and never launches the shim.
2. Build the prompt: fixed advice-only instructions, the brief, a ban on repo research, tools, and mutations, and a demand for one JSON object matching `<skill-directory>/response-schema.json` (field `advice`).
3. Pipe it to the runner. Defaults are `gpt-5.6-sol` at `max`.

   `<bounded-prompt> | node "<skill-directory>/scripts/run-advisor.mjs" [--model=<model>] --reasoning-effort=max`

The runner sends effort as `-c model_reasoning_effort=<value>`, runs read-only in an empty directory outside the repo, never sends an approval option, adds no time limit, and leaves cancellation to the operator. It relays the trimmed `advice` only after exit code `0`, one turn, exactly one agent message, no tool items (command execution, file change, MCP tool call, web search), and schema-valid output. A model-metadata fallback never switches model or executable.

## Failures

Stop with no advice and report the exact failure when:

- codex is missing or cannot start.
- The process exits non-zero. Report the exit code and any stderr.
- The output file is missing, empty, invalid JSON, or lacks a non-whitespace `advice` string.
- The stream shows a tool item, several turns, or other than one agent message.
- The model emits a model-metadata fallback. Keep the evidence, fix the cause, rerun as a new caller-owned request.

Never hide a failure behind a guessed answer. A good response is still an untrusted second opinion. For a Codex run, report the CLI version, the requested model and effort, and say when the CLI default model is used.
