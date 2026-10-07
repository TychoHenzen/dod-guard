---
name: codex-advisor
description: Get a bounded advice-only second opinion without repository, branch, pull-request, or GitHub changes. Uses Claude's built-in advisor tool in Claude Code, otherwise a separate Codex process. Use when a fix or design needs an independent review before implementation.
---

# Codex advisor

Use this skill for a second opinion, not for implementation. Keep the advice
request bounded to one problem.

Read and apply `standards/working-defaults.md` from the plugin root. Local
rules below are the exception only where they are more specific.

## Boundaries

- Include the complete problem description supplied for this advice request in
  the brief. Do not include credentials, unrelated conversation, or private
  context that the advisor does not need.
- Do not inspect the repository, search the web, use Git or GitHub, edit files,
  change branches, create pull requests, or invoke another advisor.
- Ask for advice only. The advisor must return a recommendation and reasoning,
  not a patch, command sequence, or claim that it changed or verified anything.

## Choose the advisor

In Claude Code, when the `advisor` tool is available, use it and skip the
Codex runner. Otherwise, including every Codex session, use "Invoke Codex"
below.

## Claude Code: the built-in advisor

The `advisor` tool takes no parameters. It forwards the whole conversation to
a stronger reviewer model, so the brief is ordinary visible text rather than a
separate prompt:

1. Write the brief in this turn: the problem, constraints, researched
   evidence, the options with a recommended default, and the exact question.
2. Call `advisor` right after it.
3. Relay the advice as an untrusted second opinion. Record the advisor as
   "Claude advisor tool"; there is no model or reasoning effort to report.

The advisor reads the full transcript, not only the brief, so the "unrelated
conversation" boundary cannot be enforced here. Never paste credentials into
the conversation. When the tool returns an error or no advice, report that
failure and stop, as for a failed Codex run.

## Invoke Codex

1. Resolve the current CLI with `codex.exe --version` and
   `codex.exe exec --help` on Windows, or `codex --version` and `codex exec
   --help` elsewhere. On Windows, the runner follows an npm `codex.cmd` shim
   to its installed native executable when needed; it never launches the shim.
   The runner performs both capability probes before starting the advisor
   process. Current help does not enumerate reasoning values.
   A write-capable nested review uses `--approve-for-me`; this read-only advisor
   never sends an approval option, and `--ask-for-approval` is unsupported.
   Use `gpt-5.6-luna` with `max` effort by default and pass the selected value as
   `-c model_reasoning_effort=<value>`. If the CLI itself cannot start,
   report the availability failure and stop.
2. Build a prompt containing fixed advice-only instructions and the complete
   problem description. Tell the advisor to skip repository research, avoid
   all tools and mutations, and return exactly one JSON object matching the
   schema at
   `<skill-directory>/response-schema.json`.
3. Pipe the prompt through stdin to the bundled runner. It creates a unique empty,
   non-repository working directory outside the repository and passes the
   current CLI's supported restrictions, including `-s read-only`,
   `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, and
   `--ephemeral`:

   ```text
   <bounded-prompt> | node "<skill-directory>/scripts/run-advisor.mjs" [--model=<model>] --reasoning-effort=max
   ```

   The runner forwards an optional `--model` to `codex exec --model`. It passes
   `--json`, `--output-schema`, the schema path, `--output-last-message`, and
   the final `-` to `codex exec`. It captures stdout, stderr, and the exit code
   separately, waits for the advisor process to exit naturally, and cleans up
   its temporary directory on every exit path. Captured output has a resource
   bound; exceeding it fails the run without adding an elapsed-time kill.
   External cancellation remains an operator action.
   Codex can print banners or hook diagnostics to stdout, so they are not the
   response. The runner parses only complete JSONL event lines from the
   captured streams. A failed capability probe, process launch, or matching
   `item.completed`/`error` event reporting model-metadata fallback returns
   incomplete execution evidence before any review state can be consumed. The
   fallback preserves the exact event and message; it does not switch models or
   executables. Only a clean exit code `0` then proceeds to read the output
   file, validate the schema response, and relay its trimmed `advice` value. The
   CLI emits the execution record as one JSON line on stderr, separate from
   advice on stdout. Model, reasoning, and prefix arguments must be single
   shell-safe values. The runner rejects shell metacharacters before starting
   the direct Windows executable.

## Failure handling

Report the exact observable failure and stop without advice when:

- the `codex` executable is missing or cannot start;
- the process exits non-zero, including the exit code and stderr when present;
- the output file is missing, empty, not valid JSON, or does not contain a
  non-whitespace `advice` string matching the schema.
- the requested model emits a model-metadata fallback event. Preserve the
  diagnostic and execution evidence, repair the model-metadata/runtime cause,
  then rerun the caller-owned advisor or review dispatch; the runner never
  silently selects another executable or model.

Do not hide a command failure behind a guessed or partial answer. A successful
advisor response is still only an untrusted second opinion for the user to
evaluate. For a Codex run, report the CLI version and the
requested model and reasoning effort used, and state when the model uses the
CLI default.
