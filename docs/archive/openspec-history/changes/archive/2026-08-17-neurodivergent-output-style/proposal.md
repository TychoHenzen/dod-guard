## Why

The natural-output-style plugin ships one style, Natural, which optimizes for clarity in technical prose. It has no rules for the reader's cognitive profile. A reader with AuDHD (autism + ADHD), PDA-type demand avoidance, absent interoception, and no procedural automation needs different output shaping than a neurotypical reader does. The existing `i-have-adhd` hook covers some ADHD needs (lead with action, numbered steps, restate state) but frames actions as imperatives, which is exactly the demand shape that triggers avoidance in a PDA profile. A self-contained output style can encode the full profile's constraints and resolve the ADHD/PDA collision in one place.

## What Changes

- Add `output-styles/neurodivergent.md`: a new output style that optimizes Claude's responses for a reader with the AuDHD+PDA+no-interoception profile described in `case.md`.
- Update `plugin.json` description to mention both styles.
- Update `README.md` to document the second style and what it does.
- Update root `marketplace.json` description to reflect two styles.

## Capabilities

### New Capabilities

None. This is a prose-only addition to an existing no-code plugin. No spec-level behavior changes.

### Modified Capabilities

None. `skip_specs: true` is set.

## Impact

- `plugins/natural-output-style/output-styles/neurodivergent.md` (new file)
- `plugins/natural-output-style/.claude-plugin/plugin.json` (description update)
- `plugins/natural-output-style/README.md` (documentation update)
- `.claude-plugin/marketplace.json` (description update)
- No code, no MCP server, no tests, no build.
