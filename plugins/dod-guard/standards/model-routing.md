# Model routing

Skills that delegate work to subagents route each step to one of three tiers
and pass an explicit effort. This standard defines the tiers and their rules
once. Each delegating skill names its stages and their tier, and refers here for
everything else.

## Tiers

The owner's principle decides every tier: haiku for anything that needs a lot
of effort but low intelligence, sonnet only for tasks that need the added
intelligence, and opus only when sonnet or haiku cannot figure it out.

The cheap tier is for work that needs a lot of effort but low intelligence:
implementing one task from the owner's written step plan, applying a written
plan, running validations, regenerating artifacts, reading files to answer
planned questions, capturing backlog items, and running a stage whose gates
are fail-closed scripts and named stop codes that the dispatcher re-verifies,
such as drafting a pull request from a handoff or the guarded merge.

The standard tier is for tasks that need the added intelligence: planning what
to look for, deciding scope and acceptance, writing step plans, judging
evidence into findings, designing remediation, and owning a stage whose thread
must carry out a failed row.

The strong tier is for escalation only. No stage starts on it; a stage reaches
it through "Escalation" below.

A rerun of a row takes that row's tier. A refreshed handoff, a fresh head and
CI run, or a second `/complete-pr` run is the same row again, so it does not
fall back to the standard tier.

| Tier | Claude Code `model`, `effort` | Codex agent file | Write-capable agent | Read-only agent |
|---|---|---|---|---|
| standard | `sonnet`; effort from frontmatter | `gpt-5.6-terra`; effort from frontmatter | `dod-guard:stage-standard` | `dod-guard:read-standard` |
| cheap | `haiku`; effort from frontmatter | `gpt-5.6-luna`; `codex_effort` | `dod-guard:stage-cheap` | `dod-guard:read-cheap` |
| strong | `opus`, effort `high` | `gpt-5.6-sol`, effort `high` | `dod-guard:stage-standard` with `model: opus` | `dod-guard:read-standard` with `model: opus` |

The tier agent's frontmatter is the single source for the standard and cheap
values. Its `model` and `effort` are the Claude Code values. Its
`codex_effort`, when set, is the Codex effort, and otherwise `effort` is used.
The generated `.codex/agents` files carry the Codex values, so do not copy them
elsewhere. The strong tier has no agent of its own, so its values are the ones
in the table, passed on the Agent call.

A stage that changes files uses the write-capable agent. A stage that only
plans, reads, or judges uses the read-only agent, or the stage owner's own
agent when it has one.

## Applying a tier

The two runtimes resolve a requested model differently:

- In Claude Code, the Agent call's `model` and `effort` override the agent's
  frontmatter. Every routed Agent call therefore passes both values, read from the
  tier agent's frontmatter (or from the strong row above), and the progress
  message names the stage, tier, model, and effort.
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

A skill-capable stage runs on `dod-guard:stage-standard` at its own tier's
model and effort, cheap, standard, or strong. A stage is skill-capable when it
invokes a skill, writes issue, pull request, or Project state, or needs an MCP
connector: `dod-guard:stage-cheap` and the read-only agents have no Skill tool
or MCP connector, and their own text rules out GitHub writes even through Bash,
so capability follows the agent and cost follows the model. In Claude Code,
pass the tier's `model` and `effort` on the Agent call. In Codex, the
registered stage-standard file pins the standard tier, so spawn a cheap-tier
skill-capable stage without that file, with `gpt-5.6-luna` and `max` at spawn
time, and record it as "requested, not pinned". Spawn a strong-tier stage the
same way with `gpt-5.6-sol` and `high`.

## Who dispatches

Only the thread that owns a skill's procedure dispatches its subagents.
When `dod-guard:goal-sdlc` reaches a stage whose owner splits its work into
routed rows (refinement research, `/next-ticket` tasks, `/review-pr`, or the
conflict triage in `standards/conflict-triage.md`), it runs that stage on
`dod-guard:stage-standard`, the only tier agent that inherits every
tool, including Agent and MCP connectors. The Agent call passes the model of the
stage's own tier, so an owner whose tier is cheap, such as the `/review-pr`
owner, runs on `dod-guard:stage-standard` with `model: haiku`. That stage
worker is the owner's main thread: it dispatches each row at its tier and runs
the verification below. A
worker dispatched for one row never dispatches further, even on
`dod-guard:stage-standard`. In Codex, when a spawned agent cannot spawn agents of
its own, goal-sdlc's main thread runs that owner's procedure itself and
dispatches each row directly. In this standard, "main thread" means the thread
that dispatched the work.

## Plan, investigate, judge

A judgement step that needs a large read volume runs in three parts:

1. A standard planner (`dod-guard:read-standard`) returns concrete questions,
   each with an id, the files or symbols to read, and the risk it targets.
2. Cheap investigators (`dod-guard:read-cheap`) answer each question with the
   cited path and line and the fact found there, with no verdicts.
3. After the main thread verifies the answers, a standard judge turns them into
   findings or decisions.

Read-only agents return their output as text. The main thread writes any
handoff file, such as a questions or decisions file, from that text.

## Verify cheap-tier output

Cheap-output verification applies by model tier, not by agent type: the main
thread checks a cheap-model `dod-guard:stage-standard` run like any other
cheap-tier output. Before any later stage relies on cheap-tier output, the main
thread checks that:

- every answer maps to a planned question or plan step;
- every cited path and line exists at the accepted head and says what the
  answer claims it says;
- nothing claims a verdict, or a change the step did not ask for;
- the changed files and staged state match the diff the step describes, and at
  least one named proof passes when the main thread reruns it;
- a readback of any issue, pull request, or Project state the step wrote
  shows the described change.

After every check passes, the dispatching main thread commits the verified
changes with its own attribution trailer, and pushes when the owning skill
pushes. A brief that makes a thread commit carries the attribution line from the
main session's attribution reminder verbatim. A worker dispatched for one
planned step or row never commits or pushes, whatever its tier or agent; the
dispatching main thread does. A run that owns a skill's procedure, such as
`/complete-pr` or `/fix-pr-review`, is that skill's main thread even on the
cheap model, so it commits and pushes as the skill directs, and its dispatcher
checks every commit and push it reports by reading them back.

A failed check sends the same stage back once with the exact gap, under the
failure-recovery rule in `standards/working-defaults.md`, with no commit or
push. The run does not advance on unverified output. A second failure
escalates the stage under "Escalation", and a failure on the strong rung stops
that stage as a blocker.

A `dod-guard:stage-cheap` report that a step is misrouted is not a failed
check. The main thread redispatches that step once on `dod-guard:stage-standard`
at the same tier, as a skill-capable stage, and verifies the result as
cheap-tier output.

## Verify standard-tier and strong-tier output

A standard worker returns judgements, not citations, so the per-answer check
above does not apply. Before any later stage relies on standard-tier or
strong-tier output, the main thread checks that:

- every commit the stage reports exists, is pushed, and matches the diff the
  stage describes;
- the stage's own named proof passes, and was run at the accepted head;
- a readback of any issue, pull request, or Project state the stage wrote shows
  the described change;
- a stage that implements tasks reports, for each task, its dispatch (agent,
  model, and effort) or the escalation record that explains an edit by the
  owner. A missing report is a failed check, and the main thread logs it in the
  friction log.

A failed check follows the same send-back and escalation rules as a cheap-tier
failure.

## Escalation

The strong tier is a recovery path. A stage never starts on it: it climbs from
the cheap tier to the standard tier, and from the standard tier to the strong
tier, one rung at a time. Each stage climbs a given rung at most once.

A stage climbs only after its normal repair has been tried, on one of these
triggers:

- A step's output fails the main thread's verification, is sent back once with
  the exact gap at the same tier, and fails again.
- A worker reports that the plan cannot be applied, or that the stage needs a
  decision it was not given, and the owner cannot close the gap by correcting
  the plan.
- A standard-tier stage ends with a named proof still failing after its one
  repair.

These are not triggers: a security, authority, credential, provider,
head-mismatch, destructive, or missing-evidence stop. Those stop as
`standards/working-defaults.md` says, because a stronger model does not fix
them.

A stalled stage proceeds in this order:

1. Send the stage back once at the same tier with the exact gap. A step run
   through `dod-guard:step-by-step` already has this send-back: its one fresh
   bounded repair task.
2. Before the strong rung only, ask `/codex-advisor` one question, as
   `standards/working-defaults.md` requires for a confirmed blocker. When its
   advice names a repair, apply it at the standard tier and verify. The
   cheap-to-standard rung and the rerun of a read-only review batch skip this
   step.
3. Run the stage again one rung up, with the failure record in the brief: the
   attempts, the errors, the files touched, and the advisor's advice when step 2
   ran. Verify the new run by the rules for its tier.
4. A failure on the strong rung stops the parent as a blocker, under the
   Blockers rule of `dod-guard:goal-sdlc`.

The escalating thread never changes its own model. When a cheap-tier task fails,
the owner, already a standard-tier thread that holds the plan and the failure
record, carries out the task itself. When a standard-tier stage escalates, the
thread that dispatched the stage runs it again on `dod-guard:stage-standard`
with `model: opus` and the strong effort.

A cheap-model skill-capable stage, which runs on `dod-guard:stage-standard`
with `model: haiku`, never carries out a failed row itself. It stops and
reports the failure record to its dispatcher. The dispatcher sends the stage
back once with the exact gap, then runs it again on `dod-guard:stage-standard`
with `model: sonnet` and the failure record, and after a second failure with
`model: opus` and the strong effort. A failure on the opus run stops the stage
as a blocker.

A skill that says to stop on a repeated failure keeps that rule unless this
section names it. The failed-check rule above, the investigator-batch rule in
`dod-guard:review-pr`, and the repair rule in `dod-guard:step-by-step` escalate
once and then stop. The one fresh repair task of `dod-guard:step-by-step` is the
same-tier send-back, and when the calling skill routes its steps by tier, a step
whose repair fails climbs one rung under this section instead of stopping.
Malformed judge output, a refused merge pass, and the verification stop in
`standards/conflict-triage.md` stay stops, because a stronger model does not
repair a format failure or git state.

Name every escalation in the progress message, with the stage, the tier it left,
the tier it reached, and the trigger, and append it to that day's friction log
as an occurrence. The log shows which table rows escalate often and belong one
tier higher.

## Advisor

The Codex advisor is not a lifecycle stage. It is the strong tier's
advice-only role: `gpt-5.6-sol` at `max` effort, one turn, read-only, with the
full context supplied by the caller. `dod-guard:codex-advisor` owns that
contract. In an escalation it runs before a stage climbs to the strong rung.
