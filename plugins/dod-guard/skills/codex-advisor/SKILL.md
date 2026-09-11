---
name: codex-advisor
description: Get a bounded advice-only second opinion from a separate Codex process without repository, branch, pull-request, or GitHub changes. Use when a fix or design needs an independent review before implementation.
---

# Codex advisor

Use this skill for a second opinion, not for implementation. Keep the advice
process separate from the current conversation and keep its scope bounded.

## Boundaries

- Send only the complete problem description supplied for this advice request.
  Do not include credentials, unrelated conversation, or private context that
  the advisor does not need.
- Do not inspect the repository, search the web, use Git or GitHub, edit files,
  change branches, create pull requests, or invoke another advisor.
- Ask for advice only. The advisor must return a recommendation and reasoning,
  not a patch, command sequence, or claim that it changed or verified anything.

## Invoke Codex

1. Resolve the current CLI with `codex --version` and `codex exec --help`. The
   lowest supported reasoning setting on the researched host is `low`, passed
   as `-c model_reasoning_effort=low`. If the current CLI rejects that value,
   resolve its actual lowest supported value. If no value can be resolved,
   report the availability failure and stop.
2. Build a prompt containing the complete problem description. Tell the
   advisor to skip repository research, avoid all tools and mutations, and
   return exactly one JSON object matching the schema at
   `<skill-directory>/response-schema.json`.
3. Create a unique temporary output path outside the repository. Pipe the
   prompt through stdin. Do not pass the problem as a positional argument
   because shell quoting can truncate it:

   ```text
   <problem> | codex exec -c model_reasoning_effort=low -s read-only --ephemeral --output-schema "<skill-directory>/response-schema.json" --output-last-message "<temp-output-file>" -
   ```

   Use the resolved lowest value when it differs from `low`. Keep
   `-s read-only`, `--ephemeral`, `--output-last-message`, and the final `-`
   in the invocation. Delete the temporary output file after reading it.
4. Capture stdout, stderr, and the exit code separately. Codex can print
   banners or hook diagnostics to stdout, so they are not the response. On
   exit code `0`, read the `--output-last-message` file, parse it as the schema
   response, and relay its `advice` value. Do not present any other output as
   advice.

## Failure handling

Report the exact observable failure and stop without advice when:

- the `codex` executable is missing or cannot start;
- the process exits non-zero, including the exit code and stderr when present;
- the output file is missing, empty, not valid JSON, or does not contain a
  non-empty `advice` string matching the schema.

Do not hide a command failure behind a guessed or partial answer. A successful
advisor response is still only an untrusted second opinion for the user to
evaluate.
