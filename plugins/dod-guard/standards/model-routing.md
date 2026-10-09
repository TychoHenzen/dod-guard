# Model routing

Skills that delegate work to subagents route each step to one of two tiers and
pass an explicit effort. This standard defines the tiers and their rules once.
Each delegating skill names its stages and their tier, and refers here for
everything else.

## Tiers

The strong tier is for judgement with modest reasoning effort: planning what to
look for, deciding scope and acceptance, judging evidence into findings,
drafting a pull request, remediation, and the guarded merge.

The cheap tier is for mechanical, high-volume work with high reasoning effort:
applying a written plan, running validations, regenerating artifacts, and
reading files to answer planned questions.

| Tier | Claude Code `model`, `effort` | Codex agent file | Write-capable agent | Read-only agent |
|---|---|---|---|---|
| strong | `opus`, `medium` | `gpt-5.6-sol`, `medium` | `dod-guard:stage-strong` | `dod-guard:read-strong` |
| cheap | `haiku`, `max` | `gpt-5.6-luna`, `max` | `dod-guard:stage-cheap` | `dod-guard:read-cheap` |

A stage that changes files uses the write-capable agent. A stage that only
plans, reads, or judges uses the read-only agent, or the stage owner's own
agent when it has one.

## Applying a tier

The two runtimes resolve a requested model differently:

- In Claude Code, the Agent call's `model` and `effort` override the agent's
  frontmatter. Every routed Agent call therefore passes both values from the
  tier, and the progress message names the stage, tier, model, and effort.
- In Codex, spawn-time model and effort values can be ignored or capped, and
  the values in a registered agent file take precedence. A Codex stage is
  pinned only when it runs through a registered agent whose
  `.codex/agents/*.toml` sets `model` and `model_reasoning_effort`. Regenerate
  those files with the `dod-guard:codex-migrate` converter after an agent
  changes.
- When no registered agent exists, dispatch the stage with the tier's model and
  effort as spawn-time values and record it as "requested, not pinned" in the
  progress message. Do not fall back silently to the runtime default.

A model or effort the user names for a stage wins over the tier for that run.
In Claude Code, pass the named values on the Agent call. In Codex, a pinned
agent file wins over spawn-time values, so use a registered agent whose file
sets exactly the named model and effort; when none exists, spawn an agent with
no pinned file and the named values at spawn time, and record the override as
"requested, not pinned". Never dispatch the stage's own pinned tier agent and
report the override as applied. Record the override, and how it was applied,
in the progress message.

## Who dispatches

Only the thread that owns a skill's procedure dispatches its subagents. When
`dod-guard:goal-sdlc` reaches a stage whose owner splits its work into routed
rows (refinement research, `/next-ticket` tasks, `/review-pr`, or the conflict
triage in `standards/conflict-triage.md`), it runs that stage on
`dod-guard:stage-strong`, the only tier agent that inherits every
tool, including Agent and MCP connectors. That stage worker is the owner's main
thread: it dispatches each row at its tier and runs the verification below. A
worker dispatched for one row never dispatches further, even on
`dod-guard:stage-strong`. In Codex, when a spawned agent cannot spawn agents of
its own, goal-sdlc's main thread runs that owner's procedure itself and
dispatches each row directly. In this standard, "main thread" means the thread
that dispatched the work.

## Plan, investigate, judge

A judgement step that needs a large read volume runs in three parts:

1. A strong planner (`dod-guard:read-strong`) writes concrete questions, each
   with an id, the files or symbols to read, and the risk it targets.
2. Cheap investigators (`dod-guard:read-cheap`) answer each question with the
   cited path and line and the fact found there, with no verdicts.
3. After the main thread verifies the answers, a strong judge turns them into
   findings or decisions.

## Verify cheap-tier output

Before any strong-tier judgement or later stage relies on cheap-tier output,
the main thread checks that:

- every answer maps to a planned question or plan step;
- every cited path and line exists at the accepted head and says what the
  answer claims it says;
- nothing claims a verdict, or a change the step did not ask for;
- every claimed commit exists and matches the described diff, and at least
  one named proof passes when the main thread reruns it.

A failed check sends the same stage back once with the exact gap, under the
failure-recovery rule in `standards/working-defaults.md`. The run does not
advance on unverified output. A second failure stops that stage as a blocker.

## Advisor

The Codex advisor is not a lifecycle stage. It is the strong tier's
advice-only role: `gpt-5.6-sol` at `max` effort, one turn, read-only, with the
full context supplied by the caller. `dod-guard:codex-advisor` owns that
contract.
