---
name: codex-advisor
description: Get a bounded advice-only second opinion from a separate Codex process without repository, branch, pull-request, or GitHub changes. Use when a fix or design needs an independent review before implementation.
---

# Codex advisor

Use this skill for a second opinion, not for implementation. Keep the advice
process separate from the current conversation and keep its scope bounded.

Read and apply `standards/working-defaults.md` from the plugin root. Local
rules below are the exception only where they are more specific.

## Boundaries

- Include the complete problem description supplied for this advice request in
  the bounded instruction prompt. Do not include credentials, unrelated
  conversation, or private context that the advisor does not need.
- Do not inspect the repository, search the web, use Git or GitHub, edit files,
  change branches, create pull requests, or invoke another advisor.
- Ask for advice only. The advisor must return a recommendation and reasoning,
  not a patch, command sequence, or claim that it changed or verified anything.

## Invoke Codex

1. Resolve the current CLI with `codex --version` and `codex exec --help`.
   Current help does not enumerate reasoning values. Codex issue #107 documents
   values low, medium, and high. Use `low` by default and pass the selected
   value as `-c model_reasoning_effort=<value>`. If the CLI itself cannot start,
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
   <bounded-prompt> | node "<skill-directory>/scripts/run-advisor.mjs" [--model=<model>] --reasoning-effort=low
   ```

   The runner forwards an optional `--model` to `codex exec --model`. It passes
   `--output-schema`, the schema path, `--output-last-message`, and the final
   `-` to `codex exec`. It captures stdout, stderr, and the exit code
   separately, enforces a finite timeout, reports a timed-out process, kills
   the process tree on timeout, and cleans up its temporary directory on every
   exit path. Codex can print banners or hook diagnostics to stdout, so they
   are not the response. On exit code `0`, the runner reads the output file,
   validates the schema response, and relays only its trimmed `advice` value.

## Failure handling

Report the exact observable failure and stop without advice when:

- the `codex` executable is missing or cannot start;
- the process exits non-zero, including the exit code and stderr when present;
- the process exceeds the finite timeout;
- the output file is missing, empty, not valid JSON, or does not contain a
  non-whitespace `advice` string matching the schema.

Do not hide a command failure behind a guessed or partial answer. A successful
advisor response is still only an untrusted second opinion for the user to
evaluate. Report the CLI version, requested model and reasoning effort used.
State when the model uses the CLI default.
