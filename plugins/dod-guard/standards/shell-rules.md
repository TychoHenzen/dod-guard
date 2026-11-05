# Shell rules

Worker agents embed the block between the two marker lines verbatim.
`skills/goal-sdlc/scripts/model-routing.test.mjs` fails when a copy differs, so
edit this file first and then copy the block into each agent.

<!-- shell-rules:start -->
## Shell rules

- Search and read with Grep, Glob, and Read (with offset and limit), never with `grep`, `cat`, `head`, `tail`, `sed`, `find`, `ls`, or `rg` in a shell. A shell-guard hook on this machine blocks those commands anywhere in a chain, and blocks `sleep` of 30 seconds or more. Run long work in the background and wait for its completion notice.
- Pass a directory and a glob as separate arguments (Grep `path` and `glob`). Never pass one path such as `lib\*.mjs`.
- `grep -P` fails under Git Bash with a locale error. Run it as `LC_ALL=C.UTF-8 grep -P ...`.
- `node -e` breaks on backslashes under Git Bash. Put the code in a script file and run `node <absolute path>`. Create the file with the Write tool. A read-only agent reports the need instead.
- Git Bash rewrites `git show origin/master:path` into a Windows path. Run `MSYS_NO_PATHCONV=1 git show origin/master:path`.
- `gh run view --json jobs` has no `databaseId`. `gh api repos/<owner>/<repo>/actions/workflows/ci.yml/runs` returns its list under `.workflow_runs`.
- `gh api graphql -f query='...'` with inline literals fails. Pass `-F key=value` for variables and `-F query=@<file>` for the query.
- `gh api --paginate --slurp --jq` is rejected. Run `gh api --paginate --slurp` without `--jq`, and filter the output in a separate step.
- Put `--jq` after the `gh api` endpoint and give it one quoted expression. A malformed call can leave an empty file named `--jq` in the working directory, which breaks later preflight. When `git status --porcelain` lists a dash-named file, report it, and delete only an empty one this run created.
- Never pipe a build, test, or install process into `head`, `tail`, or `Select-Object -First`. Closing the pipe early kills the producer and leaves a half-built output. Redirect the output to a file and read the file.
- Never wrap a command in a local deadline such as `WaitForExit(ms)`, `timeout`, or a `setTimeout` kill. Wait for its terminal state.
- After a rejected destructive operation, such as a denied `Remove-Item` or a blocked `rm`, stop and report it. Do not repeat it through another API such as .NET `Directory.Delete`.
- Call only the tools on your own `tools` line. No tier agent holds an MCP tool, so `mcp__ccd_turn__update_plan` and every other `mcp__` tool belong to the dispatcher. `stage-cheap` has Bash but no PowerShell tool. When the brief needs a tool you lack, stop and report the exact call.
<!-- shell-rules:end -->
