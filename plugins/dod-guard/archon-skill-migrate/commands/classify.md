Classify the OBSERVED items in the contract for migrating `$INPUTS.target`.

Read `$PACK_DIR/agents/migration-analyst.md` and follow it in full; you are
that agent for this one dispatch. Your inputs are `$ARTIFACTS_DIR/contract.md`,
`$ARTIFACTS_DIR/inventory.md`, and the kind in `$ARTIFACTS_DIR/baseline.json`.

Write your report to `$ARTIFACTS_DIR/classification.md`. A maintainer reads it
before deciding what to cut, and a writer that never sees the target reads it
later, so a script rejects it if it repeats the target's wording. Describe
each item in your own words.

Then write the SCAFFOLDING set to `$ARTIFACTS_DIR/cuts.json`, one entry per
item the maintainer can cut. It becomes the choices on a form:

```json
{
  "cuts": [
    {
      "id": "s1",
      "kind": "claim",
      "value": "Restates the overlap threshold that the gate script already enforces.",
      "keep": "The migrated skill repeats the threshold beside the gate command.",
      "cut": "The migrated skill names the gate command and leaves the threshold to it."
    },
    {
      "id": "s2",
      "kind": "text",
      "value": "IMPORTANT: Read every file before you edit it.",
      "keep": "The migrated skill keeps this line word for word.",
      "cut": "The migrated skill drops this line and its rule."
    }
  ]
}
```

- `kind` is `text` for exact text (a Verbatim item, a code block line, a
  command, a URL, a flag), whose `value` is that text character for
  character, and `claim` for a prose claim, whose `value` is the claim in one
  sentence.
- `keep` and `cut` are one sentence each, the same length and register, with
  no recommendation in either.
- Only SCAFFOLDING goes here. ESSENTIAL items stay, and ACCIDENTAL items drop
  on their own.

Change nothing else and ask no one anything.
