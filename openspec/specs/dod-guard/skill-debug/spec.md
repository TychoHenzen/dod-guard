# dod-guard/skill-debug Specification

## Purpose
Debugs another skill by reading session transcripts of its real runs. Compacts each run into a numbered trace, aligns the trace against the SKILL.md, and reports each divergence with a fix that cites a real step number.

## Requirements

### Requirement: runs come from session transcripts, not model recounting
The skill SHALL use `find-runs.mjs` to locate sessions that ran the target skill, and `extract-run.mjs` to compact each session into a numbered step trace. It SHALL NOT ask the model to recall what happened in a previous session.

#### Scenario: transcript extraction
- **WHEN** the skill is invoked with a target skill name
- **THEN** it runs `find-runs.mjs --skill=<name>` and `extract-run.mjs --session=<id> --skill=<name>` to produce numbered traces

#### Scenario: no runs found within the default window
- **WHEN** `find-runs.mjs` exits with code 4
- **THEN** the skill raises `--days` and runs it again before concluding that no runs exist

#### Scenario: subagent steps included with sidechains flag
- **WHEN** an agent brief looks more at fault than the orchestrator
- **THEN** the skill re-runs `extract-run.mjs` with `--sidechains` to fold subagent steps into the trace

### Requirement: expected sequence written before reading any trace
The skill SHALL read the target SKILL.md end to end and write the demanded phase sequence with expected trace evidence before reading any run trace. This prevents the trace from biasing the expectation.

#### Scenario: phases documented before trace
- **WHEN** the skill has read the target SKILL.md
- **THEN** it writes the expected phase list with what tool calls or outputs each phase should produce, before calling `extract-run.mjs`

#### Scenario: scripts and agents included in the expected sequence
- **WHEN** the target SKILL.md calls scripts or dispatches agents
- **THEN** the skill reads those scripts and agent definitions and includes their expected behavior in the phase sequence

### Requirement: two or more runs when available
The skill SHALL process at least two runs when `find-runs.mjs` returns multiple sessions. Single-run findings SHALL be marked as single-run evidence.

#### Scenario: single run available
- **WHEN** `find-runs.mjs` returns only one session
- **THEN** the skill processes that session and marks every finding as single-run evidence

#### Scenario: finding appears in all runs
- **WHEN** two or more runs exist and a divergence appears in every run
- **THEN** the skill reports that finding without the single-run caveat, sorting it above single-run findings

#### Scenario: short run flagged as stopped early
- **WHEN** one run is far shorter than its peers
- **THEN** the skill marks it as having stopped early in the report

### Requirement: evidence hierarchy governs conflicts
When trace evidence conflicts with the agent's own account, the skill SHALL follow a 6-level hierarchy. User turns beat tool errors. Tool errors beat wrong-argument tool calls. Wrong-argument calls beat a demanded phase with no tool line. That beats a phase out of order or missing. That beats agent say lines. Say lines are claims. Tool lines are facts.

#### Scenario: agent claims it ran a phase but no tool call exists
- **WHEN** the trace contains a text line saying "running the verification phase" but no tool call for that phase appears
- **THEN** the skill classifies the phase as "never ran" based on tool evidence, not the agent's claim

#### Scenario: user turn overrides tool evidence
- **WHEN** a user turn inside the run halted or redirected the agent and a tool call disagrees
- **THEN** the skill follows the user turn as the higher-ranked evidence

#### Scenario: tool error overrides wrong-argument call
- **WHEN** a tool call returned an error and a separate call used wrong arguments
- **THEN** the skill weighs the tool error above the argument mismatch when the two conflict

### Requirement: every fix cites a real step number
Each proposed edit to the SKILL.md SHALL cite the step number from a real run trace where the divergence occurred. The skill SHALL NOT propose edits based on taste or edits that lack trace evidence.

#### Scenario: fix references trace step
- **WHEN** the skill proposes changing a line in the target SKILL.md
- **THEN** the finding includes the run id, step number, and quoted step content that shows the divergence

#### Scenario: report sorted by cost then count
- **WHEN** the skill produces multiple findings
- **THEN** findings that cut a run short sort above those that only weakened the output, with ties broken by how many runs each finding appears in

#### Scenario: user accepts some edits and rejects others
- **WHEN** the user approves some proposed fixes and rejects others
- **THEN** the skill applies only the accepted edits, one at a time, and leaves rejected findings unchanged
