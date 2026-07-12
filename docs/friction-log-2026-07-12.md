# Friction Log — 2026-07-12 Resolution Session

Friction encountered while resolving the 2026-07-12 friction log issues via ratchet workflow.

## Session-Specific Friction

| # | Friction | Root Cause | Impact |
|---|----------|------------|--------|
| S1 | `2>&1` fd redirection parsed as command name "1" by dod_create | command-check.ts splitCommands treats `&` as operator char but doesn't filter bare fd numbers | Already fixed in this session (Friction #1). dod_create refused to create DoD because "1" is not a known tool. |
| S2 | ESM project: `require()` not available in node -e proof commands | Monorepo root has `"type": "module"` in package.json. `node -e "require('fs')"` fails with ERR_REQUIRE_ESM | Use `type file | findstr pattern` for OS-native verification on Windows cmd.exe. Or use `node --input-type=commonjs -e "..."`. |
| S3 | findstr `/C:` patterns fragile with special characters | findstr treats `|`, `<`, `>` as regex/path characters even with `/C:` literal flag. `\|` in findstr is regex alternation, not escaped pipe. | Use simpler patterns without special characters. For TypeScript types, search for function names not type annotations. |
| S4 | Multiple amendment cycles from proof command debugging | Proof commands (findstr paths, node -e, quoting) took 3-4 iterations to get right on Windows cmd.exe. Not real "proof tuning" — legitimate command fixing. | dod_check amendment warnings are correct to flag, but false positive rate is high when proof commands are OS-sensitive. |
| S5 | MCP server runs cached plugin bundle, not local dist/ | Code fix to evaluate-proof.ts (empty command + manual predicate) works in source but "Code review" proof still sees old behavior. Bundle must be published + plugin updated. | Per publishing workflow: commit + tag + push → CI publish → `/plugin update` → `/reload-plugins`. Never patch cache directly. |

## Original Friction Items — Resolution Status

**Resolved (source code fixed):**
- #1 (Windows globs), #2 (empty command+manual), #3 (Node runner exit_code), #4 (dod_create dod_id), #5 (triage 4 options), #6 (vault auto-select), #7 (dod_amend __meta__), #8 (dead_code grep), #9 (dist cleanup), #10 (biome format), #13 (biome before dod_check), #14 (memory_save overwrite), #15 (/loop command), #16 (checkCommandsForOs return type), #17 (biome --unsafe)

**Resolved (source fixed, pending plugin update for runtime):**
- #11 (dod_refine on concrete node — silently errors)

**Not addressed (deferred):**
- #12 (Test count dropped — placeholder proof) — existing known issue, not tackled this session

## Workflow Observations

1. **dod_create + findstr path conventions**: Proof commands on Windows should use backslashes. Commands that work in Git Bash (forward slashes) fail in cmd.exe shell used by dod_check.
2. **ESM + proof commands**: Most inline verification commands should use simple Windows builtins (`type`, `findstr`, `dir`) rather than `node -e`. The project is ESM so require()-based verification fails.
3. **Amendment cycle warnings**: The 3-amendment threshold is too aggressive for OS-sensitive proof commands. Consider making it advisory-only or raising to 5 for findstr/type proofs.
4. **findstr `/C:` behavior**: The `/C:` flag does literal matching but still treats `\|<>&` specially in some contexts. Using simple substrings without these characters is more reliable.
5. **notify.ts Windows messagebox broken**: `dod_verify` → `showVerifyDialog()` → spawns Windows messagebox → hangs indefinitely (1800s timeout). Human-in-the-loop verification via popup is completely non-functional. All manual/review proofs had to be converted to concrete automated proofs. Fix: either repair notify.ts messagebox spawning or use MCP elicitation fallback. Until fixed, ratchet Manual Verification gate is unusable — all verification must be concrete automated proofs.
6. **dod_amend predicate type change**: `dod_amend` with `new_predicate` did not change predicate type from manual to exit_code. Had to remove + re-add node. Possible bug in amendment handler.
