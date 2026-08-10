# natural-output-style

One output style, `Natural`. It makes Claude write plain prose every turn:
common words, short sentences, active voice, and no filler.

The rule text mirrors what `ste-lint` checks by machine. A reply written
under this style passes the same bar the checker holds files to. The style
is the instruction. The checker is the gate. Running both means the model
writes the way it gets measured.

## What the style asks for

- Use the common word over a rare one. Keep exact technical terms such as
  API names, command flags, file paths and error strings. Explain a term the
  reader may not know, right where you use it, instead of avoiding it.
- Write active voice, and use a verb for an action instead of a noun phrase.
- Do not open a sentence with `there is`, `there are`, `there was` or
  `there were` followed by a word like `a`, `some` or `many`. Name the
  subject instead.
- Cap each sentence at 20 words in a file whose name marks it as a
  procedure, such as a runbook. Every other file caps a sentence at
  25 words.
- A block's readability score comes from two things together: word rarity
  and word length. A long rare word can fail the score inside a short
  sentence.

## What ships

| Path | Role |
|------|------|
| `output-styles/natural.md` | The style itself |
| `.claude-plugin/plugin.json` | Plugin manifest |

No MCP server, no skills, no agents, no hooks. That is why this plugin sits
under `plugins/` rather than `packages/`, which holds the npm workspaces.

## Install and select

1. Install the plugin from the `dod-guard-monorepo` marketplace.
2. Run `/config` and pick `Natural` under Output style.
3. Run `/clear`, or start a new session. Claude Code reads the style once, at
   session start.

To set it without the menu, put `"outputStyle": "Natural"` in a settings file.

## Notes

- `keep-coding-instructions: true` keeps Claude Code's built-in software
  engineering behavior. The style changes the voice, not the work.
- The style applies to the main conversation. A subagent runs its own system
  prompt, so it keeps writing in its own voice.
- It conflicts with a terse reply style such as caveman, which drops articles
  and writes fragments. Pick one. The style says it wins, but the cleaner fix
  is to turn the other one off.
- `force-for-plugin` is not set, so installing the plugin never overrides a
  style you already chose.
