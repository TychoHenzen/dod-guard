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

Write the brief under these four headings, in this order, with no others:

- `Task`: the one problem this request covers.
- `Evidence`: paths, lines, quoted facts, command results, and relevant diffs for code questions.
- `Candidate`: the decision under consideration and your recommended default.
- `Question`: exactly one question. A caller whose own skill says to batch independent questions (for example `dod-guard:refine-backlog-item`) lists them as a numbered list under this one heading.

Leave out credentials, unrelated conversation, and unneeded private context. Both paths use this brief.

## Paths

In Claude Code with the `advisor` tool available, use the built-in path. Otherwise, including every Codex session, use the Codex path.

### Built-in

1. Write the brief as visible text in the current turn.
2. Call `advisor` (no parameters) immediately after.
3. Relay the advice as an untrusted second opinion. Record the advisor as "Claude advisor tool". Report no model or effort.

The advisor sees the whole transcript, so the unrelated-conversation boundary cannot hold. Never paste credentials into the conversation. If the tool errors or returns no advice, treat it as a failure (see Failures).

### Codex

Each request is exactly one `codex exec` turn returning one advice object. Do not resume, follow up, or retry.

1. Probe the CLI: `codex.exe --version` and `codex.exe exec --help` on Windows, `codex --version` and `codex exec --help` elsewhere. The runner follows the npm `codex.cmd` shim to the native exe and never launches the shim.
2. Build the prompt: fixed advice-only instructions, the brief, a ban on repo research, tools, and mutations, and a demand for one JSON object matching `<skill-directory>/response-schema.json` (field `advice`).
3. Pipe it to the runner. Defaults are `gpt-5.6-sol` at `max`.

   `<bounded-prompt> | node "<skill-directory>/scripts/run-advisor.mjs" [--model=<model>] --reasoning-effort=max`

The runner sends effort as `-c model_reasoning_effort=<value>`, runs read-only in an empty directory outside the repo, never sends an approval option, adds no time limit, and leaves cancellation to the operator. It relays the trimmed `advice` only after exit code `0`, one turn, exactly one agent message, no tool items (command execution, file change, MCP tool call, web search), and schema-valid output. A model-metadata fallback never switches model or executable.

## Failures

The advisor request ends with no advice, and you report the exact failure, when:

- codex is missing or cannot start.
- The process exits non-zero. Report the exit code and any stderr.
- The output file is missing, empty, invalid JSON, or lacks a non-whitespace `advice` string.
- The stream shows a tool item, several turns, or other than one agent message.
- The model emits a model-metadata fallback. Keep the evidence and fix the cause. Rerun once, as a new caller-owned request, only after the cause is fixed.

After any of these, the caller continues without advice and records `advisor unavailable: <reason>` in its handoff, where `<reason>` is the exact failure reported above. Never retry the same request in a loop. A caller whose own skill defines a stricter failure rule follows that rule instead: `dod-guard:refine-backlog-item` records an `unresolved-decision` and keeps the issue in Backlog.

Never hide a failure behind a guessed answer. A good response is still an untrusted second opinion. For a Codex run, report the CLI version, the requested model and effort, and say when the CLI default model is used.

## Never

- Never add a sandbox or approval option. The runner fixes `-s read-only`, sends no approval option, and reads only `--model` and `--reasoning-effort`; it ignores every other flag. Do not set `CODEX_ADVISOR_PREFIX_ARGS` to carry a sandbox or approval option either: it is the one route to the `codex` command line, and the launcher rejects approval options but not `--sandbox` or `-s`.
- Never run the runner with the repository as the working directory. The runner already starts codex in an empty temporary directory, so this keeps the caller's own environment clean and is not enforced by code.
- Never act on advice as if it were verified. It is an untrusted second opinion; verify it before relying on it.
