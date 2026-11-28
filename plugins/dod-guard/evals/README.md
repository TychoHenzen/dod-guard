# dod-guard skill trigger evals

These suites check one thing: does a natural user request make Claude choose
the right dod-guard skill, and stay away from the wrong one? Each case is a
`claude plugin eval` case with `tool_used: Skill` graders. Every case runs with
the plugin and again with no plugin (the baseline arm), so each result has a
delta.

## What the cases cover

| Group | Skills | Cases |
|---|---|---|
| `busy` | `next-ticket`, `submit-draft-pr`, `refine-backlog-item`, `complete-pr`, `review-pr`, plus one unrelated control | 24 |
| `tail` | `codex-migrate`, `learn-repository`, `teach-back`, `usability-review`, `wiring-audit` | 10 |

- A `should-trigger` case has one grader, `fires-<skill>`. It passes when the
  skill was invoked. Its baseline is 0 by construction, so its delta equals
  its trigger rate.
- A `should-not-trigger` case sends a request that belongs to an overlapping
  skill, such as `quick-pbi` against `next-ticket`. Its scored grader,
  `not-<skill>`, passes when the target skill stayed out. An unscored
  `indicator-<sibling>` grader (`arm: with-only`) reports whether the
  intended sibling fired instead.
- Every Skill grader is `arm: both`, except the indicators. Without that, the
  runner treats Skill graders as plugin-fired indicators and leaves them out
  of the score.

## Safety: why no case can write to GitHub

These skills merge pull requests, create issues, and push branches. The cases
use trigger-only graders in a read-only sandbox, not a throwaway repository:

- Every case sets `allowed_tools: [Read, Glob, Grep, Skill]`. The runner
  removes every tool that needs a grant (Bash, Write, Edit, WebFetch,
  WebSearch), and runs never stop to ask for permission. The recorded runs
  offered only Glob, Grep, Read, Skill, and ToolSearch.
- Every case sets `disallowed_tools: [Agent, TaskStop, PowerShell]`. `Agent`
  stays callable unless it is removed, and dod-guard's `stage-*` agents carry
  shell tools. The runner's docs do not name the Windows PowerShell tool as
  gated, so it is removed explicitly.
- dod-guard has no hooks, no MCP servers, and no `!` shell preprocessing in
  any SKILL.md, so nothing runs outside the agent's tool calls.
- Each run starts in an empty temporary directory with no remote.
- Never run these suites with `--allow-tools`, `--scaffold`, `--mocks off`,
  or `--allow-real-servers`.

A skill that fires reads its own SKILL.md, finds no shell, and stops with a
message saying so. That is expected; the grader has already passed.

## Running

From `plugins/dod-guard`, with a pinned model so a model rollout does not read
as a plugin regression:

```text
claude plugin eval . --trust-plugin --tag next-ticket submit-draft-pr control --model claude-opus-5-5 -j 8 --no-publish --threshold 0 --output-dir evals/results/batch1
claude plugin eval . --trust-plugin --tag complete-pr refine-backlog-item review-pr --model claude-opus-5-5 -j 8 --no-publish --threshold 0 --output-dir evals/results/batch2
claude plugin eval . --trust-plugin --tag tail --model claude-opus-5-5 -j 8 --no-publish --threshold 0 --output-dir evals/results/batch3
node evals/summarize.mjs evals/results/batch1/aggregate-result.json evals/results/batch2/aggregate-result.json evals/results/batch3/aggregate-result.json > evals/RESULTS.md
```

The batches keep each command under ten minutes. A full pass of 34 cases, 3
runs per arm, cost about $21 and took about 9 minutes at `-j 8`. Use
`--ablation none` to skip the baseline arm and halve the cost when you only
compare two descriptions of the same skill. `evals/results/` is git-ignored.

`--threshold 0` keeps the command at exit 0 so all batches finish; read the
table for failures. A case that appears in several result files keeps the
last file's result, so a rerun of a few cases goes after the full run.

## Limits

- The sandbox loads only dod-guard and the bundled skills, about 40 skills.
  A real session also loads every other plugin, and its skill listing
  overflows, so the least-used skills show by name only. These cases do not
  reproduce that overflow. Real triggering for the tail skills is worse than
  these results.
- The workspace is empty, so a prompt that depends on repository state, such
  as "the PR for my current branch", measures the empty sandbox rather than
  routing. Name the issue or pull request in the prompt instead.
- Three runs per case cannot separate 2/3 from 3/3 reliably. Treat a single
  miss as a signal to rerun, not as a result.

## Recorded run

[`RESULTS.md`](RESULTS.md) holds the run from 2026-11-28 on Claude Code
2.1.331 with `claude-opus-5-5`. The `review-pr` cases come from a rerun after
`review-pr--before-merge` was reworded to name its pull request.

- 31 of 34 cases scored 1.00. Every busy skill except `review-pr` fired 3/3
  on every phrasing, and every overlap case kept the target skill out.
- `review-pr` is the weak spot. It fired 3/3 only when the request said to
  post findings. "Take a critical look at pull request 64" fired 0/3, a
  review by URL fired 2/3 and then 1/3, and "Review PR #64 and tell me
  whether it's ready to merge" picked `review-pr` 0/3 (2/3 in a diagnostic
  rerun). In the runs whose traces were kept, the misses went to the bundled
  `code-review` skill or to no skill. The description says how the skill
  works but not when to use it.
- All five tail skills fired 3/3 on both phrasings. Their zero use on the
  owner's machine is not a routing failure inside the plugin.
