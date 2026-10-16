---
name: codex-advisor
description: Get a bounded advice-only second opinion without repository, branch, pull-request, or GitHub changes. Uses Claude's built-in advisor tool in Claude Code, otherwise a separate Codex process. Use when a fix or design needs an independent review before implementation.
---

# Codex advisor

This skill buys one independent opinion on one problem. It does not build anything.

Before you start, read and apply `standards/working-defaults.md` in the plugin root. Where this file is more specific, it wins.

## Ground rules

- Scope: one problem per request. The brief carries the whole problem description you were given.
- Keep out of the brief: credentials, unrelated conversation, and private context the advisor does not need.
- The advisor does not inspect the repository, search the web, use Git or GitHub, edit files, change branches, create pull requests, or call another advisor.
- It answers with a recommendation and its reasoning. It gives no patch and no command sequence, and it never says it changed or verified anything.
- Whatever it says is an untrusted second opinion. The user decides what to do with it.

## Choose the advisor

Pick by environment. In Claude Code, when the `advisor` tool is available, use it and skip the
Codex runner. Otherwise, including every Codex session, use "Invoke Codex".

## Claude Code: the built-in advisor

1. Write the brief in this turn, as text the user can see. Cover the problem, the constraints, the researched evidence, the options with your recommended default, and the exact question.
2. Call `advisor` right after it. It takes no parameters.
3. Pass the advice on as an untrusted second opinion. Record the advisor as "Claude advisor tool"; there is no model or effort to report.

Be aware that the tool reads the full transcript, not only the brief. The ban on unrelated conversation therefore cannot be enforced on this path. Never paste a credential into the conversation.

If the tool errors or gives back no advice, report that and stop, exactly as you would for a failed Codex run.

## Invoke Codex

The Codex path gives the same guarantees as the built-in advisor. It is exactly one `codex exec` turn that returns one advice object, with no resume, no follow-up turn, and no retry inside the request. The process is read-only, makes no edits, and makes no repository, branch, pull-request, or GitHub reads or writes.

Because the advisor does no research, the calling agent supplies the full context in the prompt:

- the task, the evidence gathered so far (paths and lines, quoted facts, command results)
- the relevant diffs when the question concerns code
- the candidate decision with its recommended default and the exact question

When the context is insufficient, it says so in its advice. It does not search, read, or run anything to make up for the gap.

### Step 1: check the CLI

Run `codex.exe --version` and `codex.exe exec --help` on Windows. Elsewhere run `codex --version` and `codex exec --help`. If the CLI cannot start, say it is unavailable and stop.

- On Windows an npm `codex.cmd` shim may be what is installed. The runner follows it to the native executable and never launches the shim.
- The runner runs both of these probes itself before it starts the advisor process.
- The default is `gpt-5.6-sol` with `max` effort by default. Current help does not enumerate reasoning values, so the runner sets effort with `-c model_reasoning_effort=<value>`.
- A write-capable nested review would use `--approve-for-me`. This read-only advisor never sends an approval option, and `--ask-for-approval` is unsupported.

### Step 2: write the prompt

Combine fixed advice-only instructions with the full context. The instructions tell the advisor to skip repository research, to avoid all tools and mutations, and to answer with exactly one JSON object that fits `<skill-directory>/response-schema.json`. That object has a single `advice` string, and the string must hold a non-whitespace character.

### Step 3: run it

Send the prompt on stdin to the bundled runner.

```text
<bounded-prompt> | node "<skill-directory>/scripts/run-advisor.mjs" [--model=<model>] --reasoning-effort=max
```

At launch the runner:

- makes a unique, empty, non-repository working directory outside the repo;
- passes `-s read-only`, `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, and `--ephemeral`;
- passes any `--model` value on as `codex exec --model`, and adds `--json`, `--output-schema` with the schema path, `--output-last-message`, and a final `-` that tells Codex to read the prompt from stdin;
- accepts the model, reasoning, and prefix arguments only as single shell-safe values, and rejects shell metacharacters before it starts the direct Windows executable.

While the process runs, the runner captures stdout, stderr, and the exit code separately and waits for the advisor process to exit. It never sets a wall-clock timeout. Captured output has a resource bound, and going over it fails the run without any elapsed-time kill. Only an operator cancels a run from outside. The runner cleans up its temporary directory on every exit path.

When the process ends, the runner reads the streams like this:

- Banners and hook diagnostics on stdout are not the response. It parses complete JSONL event lines only.
- The CLI writes its execution record as one JSON line on stderr, apart from the advice on stdout.
- If a capability probe fails, the launch fails, or a matching `item.completed` or `error` event reports a model-metadata fallback, the result is incomplete execution evidence. That happens before any review state is consumed. The exact event and message are kept, and no other model or executable is tried.
- More than one turn, other than one agent message, or any item that is not an agent message, reasoning, or a diagnostic error (a command execution, file change, MCP tool call, or web search, for example) fails the run, and no advice is used.
- Only exit code 0 with a clean stream leads on to the output file. The runner validates it against the schema and relays the trimmed `advice` value.

Your run report names the CLI version and the requested model and reasoning effort. State when the model uses the CLI default.

## When to stop

In each case below, report exactly what you saw and return no advice:

- the `codex` executable is missing or cannot start
- the process exits non-zero; include the exit code and any stderr
- the output file is missing, empty, not valid JSON, or lacks a non-whitespace `advice` string
- the JSONL stream shows a tool item, more than one turn, or other than one agent message
- the requested model emits a model-metadata fallback event

For the last case, keep the diagnostic and the execution evidence and repair the model-metadata or runtime cause. Then rerun the caller-owned advisor or review dispatch as a new request, because the runner itself never retries and never silently selects another executable or model.

Do not hide a command failure behind a guessed or partial answer.
