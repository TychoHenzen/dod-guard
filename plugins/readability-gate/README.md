# readability-gate

A Stop hook for an owner who reads only the last message of each turn, often as
a phone notification. Before Claude stops, the hook checks that this message
answers the owner in plain spoken English and stands on its own.

## What the owner has read

The owner has read their own request and the one final message they last
replied to. Nothing else counts as read: not text from earlier in the same
turn, and not the final messages of turns that a task notification or other
event started, since the owner may never have opened those.

## What it checks

One reader model (`claude -p` with Sonnet) plays the owner. It gets the
owner's request, the message they last replied to, the names of their
installed plugins and skills, and the new message. It writes what it
understood, lists up to six problems, and gives a PASS or FAIL verdict. The
problems it looks for come from
[talk-normal](https://github.com/hexiecs/talk-normal), plus references the
owner has never seen:

- **Answer.** What the owner asked for is at the top, in full. A list the owner
  asked to see is written out, not pointed at.
- **Unread references.** An issue, task or step number, a file, a check or a
  made-up label that the message uses as if the owner knew it.
- **Hard sentences.** A sentence the owner has to read twice.
- **Voice.** The message sounds like a person answering, not like a report, a
  form or a legal document. Headings are fine; the sentences under them count.
- **Decisions.** Each decision says what every choice does and which one
  Claude recommends.
- **Padding.** Filler, restating the question, "not X, but Y" frames, summary
  labels, offer menus at the end, bullets used as decoration.

Text in a code block is material for somewhere else, so only its purpose is
checked, not its wording.

The message fails when the answer is missing or buried, when the owner cannot
follow a point or make a decision it asks for, or when most of it reads like a
report. Padding alone fails only at three or more cases.

## What happens on a failure

The hook blocks the stop once per turn and sends the reader's notes back. The
notes ask Claude to write the message again from the top, keep every fact and
decision, and explain in place whatever the reader could not follow. A bare
number or label may go, as long as the thing it named stays. The rewrite is not
checked again, so a turn costs at most one extra wait.

## At session start

A SessionStart hook adds a short version of the same rules to Claude's context
on startup, resume, clear and compaction. This is how talk-normal itself works:
a prompt read before writing. With the rules in context, the first draft
passes more often and the Stop check has less to send back. The guide states
only what to do, with no examples of what to avoid, because talk-normal found
that a quoted bad example gets copied.

## What it no longer does

Earlier versions tried other checks. Each one made messages worse:

- An ASD-STE100 grammar audit. Its rewrites read like a translated manual.
- A reader that forgot every earlier turn, so each update re-explained
  everything from the start.
- A spaCy density check flagged stacked nouns, relative clauses without
  "that", and long dependencies. Over half of its noun-stack findings were
  tokenizer noise, such as `dod-guard` split into three words or a list number.
  Its fixes made messages stiffer rather than clearer.
- A repetition check counted the last three final messages as read and asked
  Claude to cut sentences that repeated them. It cut decision lists the owner
  had just asked to see again, and the rewrites pointed at "items 1 to 5 of my
  last report" instead.

## Requirements

- Python 3 on `PATH` as `python`.
- The `claude` CLI on `PATH`. The reader check runs it in print mode.

## Sign-in for the reader check

The reader check runs `claude -p`, which needs a credential. The normal `/login`
session works, but it can expire when the desktop app and the CLI share it.
A token from `claude setup-token` lasts a year. Save it in
`~/.claude/readability-gate.token` and the hook passes it to the CLI as
`CLAUDE_CODE_OAUTH_TOKEN`.

## Turning it off

Set `READABILITY_GATE=off` in the environment to skip the check. The hook sets
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
| `hooks/readability-gate.py` | Hook entry: the once-per-turn block, the session-start guide, failing open |
| `hooks/gate_transcript.py` | Reads the transcript: the current turn, the owner's request, the message they last replied to |
| `hooks/gate_reader.py` | Runs the reader model and turns its reply into a verdict |
| `prompts/reader.md` | The reader's instructions |
| `prompts/feedback.md` | What Claude is told on a failure; `{notes}` is replaced by the reader's notes |
| `prompts/guide.md` | The writing rules added to context at session start |
| `tests/` | Tests for transcript reading, the reader input, verdict parsing, the block path and the guide; no model call |
| `.claude-plugin/plugin.json` | Plugin manifest; registers the SessionStart and Stop hooks |

The prompts are plain text files so their wording can change without touching
the code.

Run the tests with `python -m unittest discover plugins/readability-gate/tests`.

No MCP server, no skills, no agents. Claude Code only: Codex has no matching
Stop hook for plugins, so this plugin has no Codex manifest.

## Install

1. Install the plugin from the `dod-guard-monorepo` marketplace.
2. If you ran this hook before as a script in `~/.claude/hooks/`, remove that
   entry from your `settings.json`. Two copies share one block count, so they
   would use up the rewrite in one round.
3. Start a new session. Claude Code loads plugin hooks at session start.
