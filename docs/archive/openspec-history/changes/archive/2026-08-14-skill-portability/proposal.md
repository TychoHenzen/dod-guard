## Why

Skills in dod-guard hard-code two things they should not. First, several skills assume the host project uses Node.js, TypeScript, npm, or esbuild - their examples reference `packages/dod-guard/dist/...` paths, `npm run build`, and `node --test`, so a user on a Rust or Python project reads instructions that do not apply. Second, four opsx skills (apply, update, sync, archive) try to infer the active change from conversation context before falling back to disk, which means running `/opsx:apply` in a fresh session behaves differently from running it right after `/opsx:propose`.

Neither issue changes what the skills do. The fix is editing SKILL.md content: replacing language-specific examples with generic ones, and removing the "infer from conversation context" instruction in favor of always reading from disk.

## What Changes

- **clean-house**: Replace JS-only route patterns, `npx jscpd`, `npm remove`, and `index.{ts,js}` barrel detection with language-neutral equivalents or multi-language examples.
- **cheap-step, ratchet**: Replace `node --test packages/dod-guard/dist/...` example commands with generic placeholders that show the pattern without naming a project.
- **tighten**: Replace `npm run clean && npm run build && npm test` in the merge procedure with a generic "project build and test" reference.
- **interview**: Show the `// covers:` marker in multiple comment syntaxes, not just JS/TS.
- **test-integrity-checker**: Replace `scripts/mutation-queue.mjs` and `scripts/micro-mutations.mjs` references with generic paths. Show the marker in multiple comment syntaxes.
- **opsx-init**: Broaden the project-context detection step so non-Node stacks get equal depth of detail, or make all stacks use the same lightweight detection.
- **opsx-apply, opsx-update, opsx-sync, opsx-archive**: Remove the "infer from conversation context" fallback for change selection. Always resolve from disk: auto-select when one active change exists, prompt when ambiguous.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change edits SKILL.md prose and examples only. No spec-level behavior changes. The change will set `skip_specs: true` in its `.openspec.yaml`.

## Impact

- **Affected files**: SKILL.md in 10 skill directories under `packages/dod-guard/skills/`.
- **No code changes**: No `.ts` files, no build output, no MCP tools.
- **No breaking changes**: Users calling these skills see the same behavior. The only difference is that opsx skills in fresh sessions will auto-select or prompt instead of silently falling back when no conversation context exists.
