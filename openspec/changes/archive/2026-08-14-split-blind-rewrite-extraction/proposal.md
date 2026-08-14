## Why

The blind-rewrite skill extracts a behavioral contract from the target before deleting it. That contract lists boundary signatures, REQUIRED/OBSERVED claims, a usage census, and a leak list. The contract is useful beyond rewrites. A developer who wants to spec an untested module or prepare for a migration needs the same extraction. Today the only path to it runs a full blind-rewrite, which quarantines and deletes files the user never meant to replace.

Splitting extraction into its own skill makes two things possible. First, any workflow can extract a contract without deleting the target. Second, blind-rewrite gets shorter: its extraction step becomes a single delegation call.

## What Changes

- New skill `/spec-extract` that takes a code or prose target and dispatches the appropriate contract-extractor agent. It writes the result as an OpenSpec-format spec with requirements and scenarios.
- Modified `/blind-rewrite`: the extraction step delegates to `/spec-extract` instead of dispatching extractor agents directly, then consumes the output.
- The extractor agents (`blind-contract-extractor`, `blind-prose-contract-extractor`) stay unchanged. `/spec-extract` dispatches them the same way blind-rewrite does today.

## Capabilities

### New Capabilities
- `dod-guard/spec-extract`: Standalone skill that extracts an exhaustive OpenSpec-format behavioral spec from a code or prose target by dispatching the appropriate contract-extractor agent.

### Modified Capabilities
- `dod-guard/blind-rewrite`: The extraction step delegates to `spec-extract` instead of dispatching extractor agents directly. The contract format, the human-review gate, and every later phase stay the same.

## Impact

- `packages/dod-guard/skills/spec-extract/` - new skill directory with SKILL.md
- `packages/dod-guard/skills/blind-rewrite/SKILL.md` - extraction step rewritten to delegate
- `packages/dod-guard/.claude-plugin/plugin.json` - skill count and registration
- `packages/dod-guard/.claude-plugin/marketplace.json` - new skill listed
- `.claude-plugin/marketplace.json` (root) - skill count updated
- No agent changes. No new dependencies. blind-rewrite's external behavior stays the same.
