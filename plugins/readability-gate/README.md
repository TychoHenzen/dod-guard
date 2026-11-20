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

One reader model (`claude -p` with Sonnet) plays the owner, who wants to spend
as little effort on the message as they can. It gets the owner's request, the
message they last replied to, the names of their installed plugins and skills,
and the new message. It writes four sections: what it understood, up to six
problems, the message the owner wanted, and a verdict. The problems it looks
for come from [talk-normal](https://github.com/hexiecs/talk-normal), plus
references the owner has never seen:

- **Answer.** What the owner asked for is in the first sentence or two, and is
  given rather than pointed at.
- **Unread references.** A number, file, check, script or label that the
  message uses as if the owner knew it.
- **Effort.** A sentence that makes more than one point, runs past about 20
  words, or tucks one clause inside another. A fix described only as new
  behavior, so the owner has to work out what was wrong.
- **Not needed.** Claude's own process (searches, failed tools, retries, notes
  for itself or for a hook), counts and file names nobody asked for, a point
  made twice.
- **Voice.** It sounds like a report, a form or a legal document.
- **Decisions.** A decision that does not say what each choice does and which
  one Claude recommends.
- **Padding.** Filler, restating the question, "not X, but Y" frames, summary
  labels, offer menus at the end, bullets used as decoration.

The wanted message keeps every decision and everything the owner must act on
or asked to see, and uses only facts from the real message. Where the owner
needs something the message does not give, such as a recommendation, the
reader writes a note in square brackets instead of making it up.

Text in a code block is material for somewhere else, so only its purpose is
checked, not its wording.

## When a message fails

Code decides, in `hooks/gate_verdict.py`. A message fails when either is true:

- The reader's verdict is FAIL. The verdict covers only whether the owner can
  act on the message: the answer is missing or buried, it relies on something
  the owner cannot place, or it asks for a decision the owner cannot make.
- The wanted message is at least 60 words and at least 30% shorter, and the
  reader listed at least one problem. Words inside code blocks are not
  counted.

The length rule exists because a reader asked for a holistic verdict passed
long, report-style messages while listing three or four real problems in
them. On real messages, the drafts for messages the owner rejected cut 36% to
70% and over 100 words. The drafts for short messages the owner accepted cut
under 30 words.

## What happens on a failure

The hook blocks the stop once per turn. The reason holds the reader's notes and
its wanted message, which Claude uses as the shape and length to aim for.
Claude checks every fact in the draft, fills in the notes in square brackets,
and drops any question or recommendation it does not mean. It adds back only
what the owner needs, and leaves out its own process. The rewrite is not
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
- A reader verdict on the whole message, where padding failed only at three or
  more cases. It passed a 293-word report three times out of three. Its
  feedback asked Claude to keep every fact, so rewrites grew instead of
  shrinking.

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
| `hooks/gate_state.py` | The log and the per-session block count |
| `hooks/gate_input.py` | Builds the reader's input: the owner's tools, request and last-read message |
| `hooks/gate_reader.py` | Runs the reader model |
| `hooks/gate_verdict.py` | Splits the reader's reply into its sections and decides pass or fail |
| `prompts/reader.md` | The reader's instructions |
| `prompts/feedback.md` | What Claude is told on a failure; `{notes}` and `{wanted}` are replaced by the reader's notes and draft |
| `prompts/guide.md` | The writing rules added to context at session start |
| `tests/` | Tests for transcript reading, the reader input, the verdict, the block path and the guide; no model call |
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
