## 1. Opsx session-independence

- [x] 1.1 Edit `opsx-apply/SKILL.md`: remove "infer from conversation context" for change selection. Keep the three-step resolution: argument, auto-select if one active change, prompt otherwise.
- [x] 1.2 Edit `opsx-update/SKILL.md`: same change as 1.1.
- [x] 1.3 Edit `opsx-sync/SKILL.md`: same change as 1.1.
- [x] 1.4 Edit `opsx-archive/SKILL.md`: same change as 1.1.

## 2. Language-agnostic examples in non-opsx skills

- [x] 2.1 Edit `clean-house/SKILL.md`: replace JS-only route patterns (`router.get`, `@Get`, `registerRoutes|app.use|Router()`), `npx jscpd`, `npm remove`, and `index.{ts,js}` barrel detection with language-neutral equivalents or angle-bracket placeholders.
- [x] 2.2 Edit `cheap-step/SKILL.md`: replace `node --test packages/dod-guard/dist/...` example commands with `<project-test-command>` style placeholders.
- [x] 2.3 Edit `ratchet/SKILL.md`: replace `node --test packages/dod-guard/dist/...` example commands with `<project-test-command>` style placeholders.
- [x] 2.4 Edit `tighten/SKILL.md`: replace `npm run clean && npm run build && npm test` in the merge procedure with `<project-clean-command> && <project-build-command> && <project-test-command>`.
- [x] 2.5 Edit `interview/SKILL.md`: show the `// covers:` marker in multiple comment syntaxes (JS, Python, Rust, Go) instead of JS-only.
- [x] 2.6 Edit `test-integrity-checker/SKILL.md`: replace `scripts/mutation-queue.mjs` and `scripts/micro-mutations.mjs` with generic paths. Show the `// covers:` marker in multiple comment syntaxes.

## 3. Language-agnostic project detection in opsx-init

- [x] 3.1 Edit `opsx-init/SKILL.md`: replace the deep Node.js detection block (reading `package.json` scripts, identifying specific test runners and bundlers) with the same lightweight detection all other stacks already use: find the manifest, read build/test commands, report them.

## 4. Validation

- [x] 4.1 Run `validate-plugins.mjs` to confirm all edited SKILL.md files still pass manifest and reachability checks.
- [x] 4.2 Run `check-skill-hygiene.mjs` to confirm no skill-hygiene rule is violated by the edits.
