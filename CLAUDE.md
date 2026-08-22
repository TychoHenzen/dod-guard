@AGENTS.md

# Claude Code-specific instructions

- Never copy `dist/bundle.js` into `~/.claude/plugins/cache/` by hand.
- After release CI passes and local `master` is synchronized, run `/plugin update` and `/reload-plugins`.
