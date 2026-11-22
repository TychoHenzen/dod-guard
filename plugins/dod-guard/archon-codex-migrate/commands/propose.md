Inventory this project's agent setup for codex-migrate and propose the slices
that would make it work well with Codex as well as Claude.

Read `$PACK_DIR/skills/codex-migrate/SKILL.md`. Follow its opening rules,
"Inventory (read-only)" items 2 and 4, and "Proposal". The scanner baseline is
already saved in `$ARTIFACTS_DIR/baseline.json`; read it instead of running the
scanner. This workflow does the rest: a maintainer picks slices on a form,
later sessions apply them, and scripts verify and commit each one. So:

- Change nothing in the project. Do not run the converter into the project.
  The two files you write are `$ARTIFACTS_DIR/proposal.md` and
  `$ARTIFACTS_DIR/slices.json`.
- Ask no one anything. The form is the approval, so put each open choice in
  the proposal and make each alternative its own slice.

`proposal.md` is what the maintainer reads before picking: the paths and
findings from the inventory, each item's classification, the trade-offs, and
for any existing `AGENTS.md` the unique content a slice would move into it.

Write `$ARTIFACTS_DIR/slices.json` as one JSON object:

```json
{
  "test": "npm test",
  "agentSource": ".claude/agents",
  "slices": [
    {
      "id": "move-shared",
      "label": "Move the shared rules from CLAUDE.md into AGENTS.md",
      "kind": "reduce-claude",
      "from": ["CLAUDE.md"],
      "to": ["AGENTS.md"],
      "plan": "Move sections Build, Style and Check-ins into AGENTS.md word for word, then leave CLAUDE.md as the one line @AGENTS.md."
    },
    {
      "id": "checkin-wording",
      "label": "Word the check-in rule by capability",
      "kind": "reword",
      "files": ["AGENTS.md"],
      "signals": ["AskUserQuestion"],
      "plan": "Say 'ask the user with the environment's question tool' and keep the tool names in a per-environment section."
    },
    {
      "id": "codex-agents",
      "label": "Generate Codex agents from .claude/agents",
      "kind": "agents",
      "plan": "Run the converter; the TOML is generated, never edited."
    }
  ]
}
```

- `test`: the test command the project documents in `AGENTS.md` or
  `CLAUDE.md`, run from the root. Empty when none is documented; do not guess
  one from `package.json`.
- `agentSource`: the Claude agent directory, empty when there is none.
- `kind` is one of:
  - `reword`: rewords environment-specific text in `files`. `signals` lists
    the scanner signals, exactly as `baseline.json` spells them, that the
    slice removes from those files. It is empty when the scanner flags none
    of the text; the report then says only the tests verified the slice.
  - `move`: moves content from the `from` files to the `to` files unchanged.
  - `reduce-claude`: a move that leaves `CLAUDE.md` as the one-line
    `@AGENTS.md` import.
  - `agents`: regenerates `.codex/agents` from `agentSource`. A slice that
    edits files under `agentSource` gets the regeneration as well.
- One concern per slice, in the order they should apply; a later slice sees
  the commits of the earlier ones. Paths are repository-relative with forward
  slashes. No slice names a file under `.codex/agents/`.
- `plan` says exactly what changes, so a session with no other context can
  apply it.
