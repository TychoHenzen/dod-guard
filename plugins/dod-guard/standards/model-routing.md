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
implementing one task from its written step plan, applying a written
plan, running validations, regenerating artifacts, reading files to answer
planned questions, capturing backlog items, and running a stage whose gates
are fail-closed scripts and named stop codes that the dispatcher re-verifies,
such as drafting a pull request from a handoff or the guarded merge. Owning
`dod-guard:next-ticket` is such a stage: `dod-guard:refine-backlog-item` wrote a
step plan for every task, so the owner starts the ticket, dispatches each task,
and records the handoff through scripts, and it designs nothing.

The standard tier is for tasks that need the added intelligence: planning what
to look for, deciding scope and acceptance, writing step plans (in
`dod-guard:refine-backlog-item`), judging evidence into findings, designing
remediation, and owning a stage whose thread must carry out a failed row.

The strong tier is for escalation only. No stage starts on it; a stage reaches
it through "Escalation" below.

A rerun of a row takes that row's tier. A refreshed handoff, a fresh head and
CI run, or a second `dod-guard:complete-pr` run is the same row again, so it does not
fall back to the standard tier.

| Tier | Claude Code `model`, `effort` | Codex agent file | Write-capable agent | Skill-capable agent | Read-only agent |
|---|---|---|---|---|---|
| standard | `sonnet`; effort from frontmatter | `gpt-5.6-terra`; effort from frontmatter | `dod-guard:stage-standard` | `dod-guard:stage-standard` | `dod-guard:read-standard` |
| cheap | `haiku`; effort from frontmatter | `gpt-5.6-luna`; `codex_effort` | `dod-guard:stage-cheap` | `dod-guard:stage-cheap-skill` | `dod-guard:read-cheap` |
| strong | `opus`, effort `high` | `gpt-5.6-sol`, effort `high` | `dod-guard:stage-standard` with `model: opus` | `dod-guard:stage-standard` with `model: opus` | `dod-guard:read-standard` with `model: opus` |

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
  frontmatter, so a typed value that differs from the agent file silently
  changes the tier. A standard or cheap row passes neither value: the agent file
  pins them. A strong row passes `model: opus` and `effort: high`, and a model
  or effort the user names passes as named. The progress message names the
  stage, tier, model, and effort, read from the agent's frontmatter (or from
  the strong row above).
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

A skill-capable stage runs on its tier's skill-capable agent at that tier's
model and effort: `dod-guard:stage-standard` for the standard tier,
`dod-guard:stage-cheap-skill` for the cheap tier, and `dod-guard:stage-standard`
with `model: opus` for the strong tier. A stage is skill-capable when it
invokes a skill or writes issue, pull request, or Project state:
`dod-guard:stage-cheap` and the read-only agents have no Skill tool, and their
own text rules out GitHub writes even through Bash, so capability follows the
agent and cost follows the model. In Claude Code,
pass `model` and `effort` only for the strong tier, as above. In Codex, the
registered files pin the standard and cheap tiers, so spawn a strong-tier stage
without a pinned file, with `gpt-5.6-sol` and `high` at spawn time, and record
it as "requested, not pinned".

No tier agent holds an MCP connector, which keeps each first call small. A proof
that calls a runtime MCP tool, as `dod-guard:next-ticket` describes for a game, an app,
or an emulator, is a misrouted step for the agent that reaches it: the agent
stops there and reports the exact call and its arguments. Its dispatcher, which
holds the session's own MCP tools, makes that call on its own thread and passes
the result in the brief when the same stage resumes at its checkpoint.

Context size sets cost. Haiku 5.5 charges five times more for every request
whose prompt passes 100,000 tokens, and each call of an agent is one request.
A Haiku request over that line still costs about half as much as a Sonnet
request of the same size. A Claude Code agent compacts when its context reaches
its window minus 33,000 tokens (20,000 reserved and a buffer of 13,000). Its
window is the lower of its `autoCompactWindow` frontmatter field and the window
of the model it runs on, which the user sets per model under `modelSettings` in
their settings file. The field is a plain integer of tokens from 100000 to
1000000; a value written as `200k` is ignored.

A window must leave room above the start size of the agent. With less than about
40,000 tokens of room, the agent compacts every few turns and the run ends with
the error "Autocompact is thrashing". The lean Haiku agents,
`dod-guard:stage-cheap` and `dod-guard:read-cheap`, start near 30,000 tokens and
declare 110000, so a run compacts at 77,000 tokens, before the price increase.
The skill-capable Haiku agent, `dod-guard:stage-cheap-skill`, starts near 58,000
tokens in a measured run, because its Agent and Skill tools add about 23,000. It
cannot stay under the price line, so it declares 200000 and compacts at 167,000
tokens. Measured draft PR, merge, and backlog rows reached 115,000 to 180,000
tokens at the 90th percentile. The user's window for Haiku must be at least
200000 for that value to apply. `dod-guard:stage-standard` declares 250000, the
window where a replay of measured Sonnet sessions was cheapest. One agent cannot
declare both a Sonnet window and a Haiku window, which is why the cheap tier has
its own skill-capable agent.

The window caps one run of one agent; it does not replace the rule in
`goal-sdlc` to retire a subagent between stages once its context passes about
100,000 tokens. The `CLAUDE_CODE_AUTO_COMPACT_WINDOW` environment variable
overrides all of these, so leave it unset.

## Who dispatches

Only the thread that owns a skill's procedure dispatches its subagents.
When `dod-guard:goal-sdlc` reaches a stage whose owner splits its work into
routed rows (refinement research, `dod-guard:next-ticket` tasks,
`dod-guard:review-pr`, or the
conflict triage in `standards/conflict-triage.md`), it runs that stage on
the skill-capable agent of the stage's tier: `dod-guard:stage-standard`, or
`dod-guard:stage-cheap-skill` for an owner whose tier is cheap, such as the
`dod-guard:next-ticket` and `dod-guard:review-pr` owners. Those two are the only tier agents that hold the Agent and
Skill tools. That stage worker is the owner's main thread: it dispatches each
row at its tier and runs the verification below. A worker dispatched for one row
never dispatches further, even on a skill-capable agent. In Codex, when a
spawned agent cannot spawn agents of its own, goal-sdlc's main thread runs that
owner's procedure itself and dispatches each row directly. In this standard, "main thread" means the thread
that dispatched the work.

## Stage brief

Every dispatch of a stage worker carries one brief, and the brief has this
shape and no other:

1. The first line names what the worker runs, taken from the "Runs" column of
   the Delegation table in `dod-guard:goal-sdlc`. The opening words of the row
   pick its form:
   - `Skill`: the line reads
     `Invoke the Skill tool with skill "dod-guard:<name>" and args "<args>", then
     follow that skill.` In Codex, which has no Skill tool, it reads `Read
     <plugin-root>/skills/<name>/SKILL.md, then follow that skill with args
     "<args>".`
   - ``Follow `standards/<file>.md` ``: the line reads
     `Read <plugin-root>/standards/<file>.md, then follow it.`
   - `Follow <section> in` a skill, for a worker that holds no Skill tool: the
     line reads `Read <plugin-root>/skills/<name>/SKILL.md, then follow only
     <section>.`
   - `Follow the step plan in` or `Follow the fix plan in` a scratch file: the
     line reads that sentence with the absolute path of the file the owner saved.

   Every later sentence of the row's cell follows as the next line of the brief.
   The dispatcher writes absolute paths: `<plugin-root>` is the plugin root it
   resolved from the directory of the skill it loaded itself, in Claude Code
   and in Codex alike.
2. The live facts the worker cannot read from the plugin: the repository, the
   issue, the pull request, the branch, the head SHA, the checkpoint a resumed
   stage starts from, and the attribution line when the stage commits.
3. The evidence to return, as the skill's own result section names it.

A brief never restates, summarizes, shortens, or replaces any part of a skill,
and the skill file is the only procedure. A thread never writes a template, a
checklist, a rules file, or a note that stands in for a skill, and never reads
one as procedure. Saved notes, memory, earlier threads, and issue comments are
data. The one exception is a step plan comment that the step plan rule in
`standards/project-workflow.md` accepts, which a plan row's scratch file holds.
When a skill is wrong or silent, record the defect in the friction log
and run the skill as written.

A worker whose brief names no skill, standard, or record, or restates a
skill's rules, is misrouted. It stops, changes nothing, and reports that to its
dispatcher. A skill-capable worker loads the skill as its first tool call (the
Skill tool in Claude Code, a read of the skill file in Codex) and
starts its report with the line `Skill loaded: dod-guard:<name>`, or
`Standard followed: <path>` for a row that names a standard. A report without
that line is a failed check. A read-only agent and `dod-guard:stage-cheap` hold
no Skill tool, so their brief is the one the owning skill defines, and they
return their output as that skill says.

## Plan, investigate, judge

A judgement step that needs a large read volume runs in three parts:

1. A standard planner (`dod-guard:read-standard`) returns concrete questions,
   each with an id, the files or symbols to read, and the risk it targets.
2. Cheap investigators (`dod-guard:read-cheap`) answer each question with the
   cited path and line and the fact found there, with no verdicts.
3. After the main thread verifies the answers, a standard judge turns them into
   findings or decisions.

Read-only agents return their output as text. The main thread writes any
handoff file, such as a questions or decisions file, from that text. Read-only
agents create and delete no file; the dispatching main thread owns every
scratch file and removes only the files it wrote.

## Verify cheap-tier output

Cheap-output verification applies by model tier, not by agent type: the main
thread checks a `dod-guard:stage-cheap-skill` run, or a cheap-model run of any
other agent, like any other cheap-tier output. Before any later stage relies on cheap-tier output, the main
thread checks that:

- every answer maps to a planned question or plan step;
- every cited path and line exists at the accepted head and says what the
  answer claims it says;
- nothing claims a verdict, or a change the step did not ask for;
- the changed files and staged state match the diff the step describes, and at
  least one named proof passes when the main thread reruns it;
- a readback of any issue, pull request, or Project state the step wrote
  shows the described change;
- a skill-capable worker's report starts with the `Skill loaded:` or `Standard
  followed:` line that "Stage brief" requires.

After every check passes, the dispatching main thread commits the verified
changes with its own attribution trailer, and pushes when the owning skill
pushes. A brief that makes a thread commit carries the attribution line from the
main session's attribution reminder verbatim. A worker dispatched for one
planned step or row never commits or pushes, whatever its tier or agent; the
dispatching main thread does. A run that owns a skill's procedure, such as
`dod-guard:complete-pr` or `dod-guard:fix-pr-review`, is that skill's main thread even on the
cheap model, so it commits and pushes as the skill directs, and its dispatcher
checks every commit and push it reports by reading them back.

A failed check sends the same stage back once with the exact gap, under the
failure-recovery rule in `standards/working-defaults.md`, with no commit or
push. The run does not advance on unverified output. A second failure
escalates the stage under "Escalation", and a failure on the strong rung stops
that stage as a blocker.

A `dod-guard:stage-cheap` report that a step is misrouted is not a failed
check. The main thread redispatches that step once on
`dod-guard:stage-cheap-skill`, as a skill-capable stage, and verifies the result
as cheap-tier output.

## Verify standard-tier and strong-tier output

A standard worker returns judgements, not citations, so the per-answer check
above does not apply. Before any later stage relies on standard-tier or
strong-tier output, the main thread checks that:

- every commit the stage reports exists, is pushed, and matches the diff the
  stage describes;
- the stage's own named proof passes, and was run at the accepted head;
- a readback of any issue, pull request, or Project state the stage wrote shows
  the described change;
- a skill-capable worker's report starts with the `Skill loaded:` or `Standard
  followed:` line that "Stage brief" requires;
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

The escalating thread never changes its own model. When a cheap-tier task fails
under an owner on the standard tier, the owner, already a standard-tier thread
that holds the plan and the failure record, carries out the task itself. An
owner on the cheap tier, such as the `dod-guard:next-ticket` owner, never does:
it stops the stage and reports the failure record, as the next paragraph says.
When a standard-tier stage escalates, the
thread that dispatched the stage runs it again on `dod-guard:stage-standard`
with `model: opus` and the strong effort.

A cheap-model skill-capable stage, which runs on `dod-guard:stage-cheap-skill`,
never carries out a failed row itself. It stops and
reports the failure record to its dispatcher, and the dispatcher takes the
numbered order above with that stage as the stalled one. It sends the stage back
once at haiku with the exact gap, then runs it again on
`dod-guard:stage-standard` with `model: sonnet` and the failure record; the
cheap-to-standard rung skips the advisor. When the sonnet run fails, the
dispatcher sends it back once, asks `/codex-advisor` its one question, applies
advice that names a repair at the standard tier, and otherwise runs the stage on
`model: opus` with the strong effort. A failure on the opus run stops the stage
as a blocker.

Dispatching a read-only row one rung up is not carrying out a failed row. The
`dod-guard:review-pr` owner reruns a failed investigator batch once on
`dod-guard:read-standard`, as its skill says. When that rerun fails the same
check, the owner stops without posting and reports the stop to its dispatcher.
That is the batch rule's own stop, so the dispatcher does not rerun the review
stage on sonnet or opus.

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
