## Context

See proposal.md for motivation. blind-rewrite currently handles contract extraction inline. It classifies code vs prose, dispatches the right extractor agent, screens the output against banned vocabulary, and merges existing OpenSpec claims. That logic is roughly 40 lines embedded in the ten-phase flow.

The extractor agents (`blind-contract-extractor`, `blind-prose-contract-extractor`) already produce structured output. The new skill wraps them with the classification step and an output-format transform, then writes the result as a file.

## Goals / Non-Goals

**Goals:**
- A standalone `/spec-extract` skill that any workflow or user can invoke to get a behavioral spec from a target.
- blind-rewrite's extraction step reduced to a single delegation call.
- No change to the extractor agents themselves.

**Non-Goals:**
- Changing the contract format the extractor agents produce. The transform from agent output to OpenSpec format happens in the new skill, not by modifying the agents.
- Adding a CLI command or MCP tool for extraction. This is a skill only.
- Changing any blind-rewrite phase other than Phase 2.

## Decisions

### 1. spec-extract is a skill, not an agent

Extracting a contract requires classifying the target, dispatching an agent, transforming the output, and writing a file. That sequence is orchestration, which is a skill's job. An agent would need Write/Edit tools and shell access to check for existing OpenSpec specs, making it heavier than necessary.

Alternative considered: making it an agent. Rejected because the orchestrator (Claude) already has the tools, and the classification + merge logic benefits from seeing the full project context.

### 2. Output format is OpenSpec spec markdown

The extractor agents produce a structured report: boundary, usage census, claims, leak list, banned vocabulary. The skill transforms that report into OpenSpec spec format. The result can be archived into `openspec/specs/` or consumed by any OpenSpec-aware workflow.

Alternative considered: keeping the current agent-report format. Rejected because the whole point is reuse, and OpenSpec format is the one other workflows already consume.

### 3. blind-rewrite reads the spec-extract output file

blind-rewrite's extraction step invokes `/spec-extract` with the target path, then reads the output file. The contract is the same structured content it gets today, read from a file instead of parsed from an agent result. The banned-vocabulary screening and the human-review gate stay in blind-rewrite because they are rewrite-specific.

Alternative considered: having spec-extract return the contract in-band rather than writing a file. Rejected because file output is more composable and lets the user inspect or edit the extraction before a rewrite proceeds.

### 4. Default output path uses .spec-extract/ beside the target

When no output path is specified, the skill writes to `.spec-extract/<target-stem>.spec.md` beside the target file. This keeps the output discoverable without polluting the target's directory. The `.spec-extract/` directory should be added to `.gitignore` as scratch output.

Alternative considered: writing to a temp directory. Rejected because the output is meant to persist for review and reuse, not be discarded after the session.

## Risks / Trade-offs

[Risk] The agents may produce less complete output when invoked standalone, without the context blind-rewrite provided.
-> Mitigation: the extractor agents already discover leaks and classify targets on their own. Shape classification is a blind-rewrite concern the extractor does not need.

[Risk] Adding a `.spec-extract/` directory to the working tree introduces another scratch artifact that could leak into git.
-> Mitigation: add `.spec-extract/` to `.gitignore` in the same commit that creates the skill. The CLAUDE.md rule "a process that generates a file keeps that file out of git" already covers this pattern.

[Risk] blind-rewrite now depends on a second skill being installed. If `/spec-extract` is missing, extraction fails.
-> Mitigation: both skills ship in the same plugin (`dod-guard`). A user who has blind-rewrite always has spec-extract.
