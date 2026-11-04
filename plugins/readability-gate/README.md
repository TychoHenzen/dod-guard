# readability-gate

A Stop hook for an owner who reads only the last message of each turn, often as
a phone notification. Before Claude stops, the hook checks that this message
explains the whole turn by itself. Text written earlier in the same turn does
not count as read. The final messages of the last three turns do count, so the
message should build on them instead of repeating them.

## What it checks

Three checks run, cheapest first:

- **Repetition.** A sentence that shares most of its content words with a
  sentence of a recent final message counts as a repeat. Two repeats fail the
  message. No model call.
- **Density.** spaCy parses the message and flags the constructions that make
  generated text hard to read: three or more nouns stacked ("release speed
  function"), a relative clause with its "that" dropped, a thing doing what a
  person does ("the check swallows the error"), and words that belong together
  held more than 12 words apart. Three findings fail the message. No model call.
- **References.** A reader model (`claude -p` with Sonnet) gets only what the
  owner has read: their request, the last few final messages, and the names of
  their installed plugins and skills. It lists every issue number, made-up label
  or count that the message never explains, and gives a PASS or FAIL verdict.

When a check fails, the hook blocks the stop and sends the findings back to
Claude, which rewrites the message. It blocks at most twice per turn, so a turn
can never loop. Code blocks, inline code and quoted text are ignored by the
first two checks.

## Requirements

- Python 3 on `PATH` as `python`.
- The `claude` CLI on `PATH`. The reader check runs it in print mode.
- Optional: spaCy with the `en_core_web_sm` model for the density check. Without
  them that check is skipped and logged, and the other two still run:

  ```text
  pip install spacy
  python -m spacy download en_core_web_sm
  ```

## Sign-in for the reader check

The reader check runs `claude -p`, which needs a credential. The normal `/login`
session works, but it can expire when the desktop app and the CLI share it.
A token from `claude setup-token` lasts a year. Save it in
`~/.claude/readability-gate.token` and the hook passes it to the CLI as
`CLAUDE_CODE_OAUTH_TOKEN`.

## Turning it off

Set `READABILITY_GATE=off` in the environment to skip every check. The hook sets
it for its own `claude -p` call, and that call loads no settings or plugins, so
the reader is never checked itself.

## When something goes wrong

The hook fails open. On any error Claude stops normally, and the hook shows
"Readability check did not run: ..." with the reason. Every pass, block and
error is logged in `~/.claude/hook-state/readability-gate.log`. The per-session
block count lives next to it in `<session id>.gate.json`.

## What ships

| Path | Role |
|------|------|
| `hooks/readability-gate.py` | The three checks |
| `.claude-plugin/plugin.json` | Plugin manifest; registers the Stop hook |

No MCP server, no skills, no agents. Claude Code only: Codex has no matching
Stop hook for plugins, so this plugin has no Codex manifest.

## Install

1. Install the plugin from the `dod-guard-monorepo` marketplace.
2. If you ran this hook before as a script in `~/.claude/hooks/`, remove that
   entry from your `settings.json`. Two copies share one block count, so they
   would use up both rewrites in one round.
3. Start a new session. Claude Code loads plugin hooks at session start.
