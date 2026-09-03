## Context

See proposal.md for motivation. The archive skill already has a coverage gate (step 6) that runs `dod-guard cover` and blocks on regressions. The new review step slots between the coverage gate and the archive command.

The skill is pure SKILL.md orchestration. It tells the agent what to do. No `src/` code changes are needed.

## Goals / Non-Goals

**Goals:**
- Add a code-review step that reads the implementation diff before archiving
- Keep the step fast enough that it does not make archiving feel heavy
- Block archive when the review surfaces issues the user has not acknowledged

**Non-Goals:**
- Deep multi-agent review (that is `/code-review ultra`, overkill for a gate)
- Automated fix-and-retry loop - the skill reports findings and the user decides
- Reviewing planning artifacts (proposal, design, tasks) - only implementation code

## Decisions

**Review mechanism: `/code-review low` invoked inline by the agent.**
The archive skill is a SKILL.md that an agent follows. The agent already has access to `/code-review`. Invoking it at `low` effort gives a fast, focused review. No new tooling or scripts needed.

Alternative considered: a dedicated `review-for-archive` script. Rejected because `/code-review` already exists and handles file targeting.

**Scope determination: read `tasks.md` impact section and spec capabilities.**
The tasks file lists affected files. The spec's capability path names the package. Together they scope the review to the right files without a full-repo diff.

Alternative considered: `git diff` against the branch point. Rejected because the archive skill runs on `master` after implementation is merged - there is no branch to diff against.

**Blocking behavior: findings prompt the user, not hard-block.**
Unlike the coverage gate (which hard-blocks on exit 1), the code review asks the user whether to proceed. A review finding is a judgment call, not a measured regression. The user may decide a finding is acceptable.

Alternative considered: hard-block like the coverage gate. Rejected because review findings have false positives, and the coverage gate already provides the hard safety net.

## Risks / Trade-offs

- [Risk] Review adds time to every archive. -> Mitigation: `low` effort keeps it to a single fast pass. The user can also acknowledge findings and proceed.
- [Risk] Review scope misses files the change touched but did not list in tasks. -> Mitigation: acceptable for a sanity check. The coverage gate already catches scenario regressions. A missed file means a missed review comment, not a missed gate.
