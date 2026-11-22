Review the interface or workflow described in `$ARTIFACTS_DIR/request.md`
against this checkout.

Read `$PACK_DIR/skills/usability-review/SKILL.md` and
`$PACK_DIR/standards/working-defaults.md`, and follow the skill. The PBI and
its acceptance criteria are in `$ARTIFACTS_DIR/issue.json` when that file
exists. Read the repository's own instructions too.

You have no browser and nothing running, so the evidence is what the checkout
holds: source, help text, configuration, documentation, and any screenshots
or mockups committed to it. A state you could only see live is not observed.

If `$ARTIFACTS_DIR/feedback.md` exists, a script rejected your previous
findings for the reasons it lists. Fix each one; a reason is a fact about the
checkout, so check it rather than argue with it.

Write your review, and nothing else, to `$ARTIFACTS_DIR/findings.json`. A
script renders the skill's report from it:

```json
{
  "user": "who uses it",
  "task": "the primary task, as a verb phrase",
  "outcome": "what they expect when it works",
  "surface": "CLI",
  "evidenceUsed": ["src/cli.ts and its --help text", "README.md"],
  "evidenceUnavailable": ["no screenshots of the error output"],
  "journey": {
    "discoverability": { "status": "covered", "note": "what the evidence shows", "evidence": [{ "path": "README.md", "line": 12 }] },
    "wording": { "status": "not observed" },
    "affordances": { "status": "covered", "note": "...", "evidence": [{ "path": "src/cli.ts", "line": 40, "end": 58, "anchor": "--dry-run" }] },
    "progress": { "status": "inapplicable" },
    "success": { "status": "covered", "note": "...", "evidence": [{ "path": "src/cli.ts", "line": 90 }] },
    "error": { "status": "not observed" }
  },
  "usesAi": false,
  "findings": [
    {
      "severity": "high",
      "title": "short title",
      "impact": "what the user loses or risks",
      "evidence": [{ "path": "src/cli.ts", "line": 71 }],
      "change": "the smallest change that removes the problem",
      "verification": "how to confirm the change worked"
    }
  ]
}
```

- `surface` is `CLI`, `API`, `docs`, `GUI` or `other`.
- `journey` holds the six questions, keyed `discoverability`, `wording`,
  `affordances`, `progress`, `success` and `error`. Each is `covered`,
  `not observed`, or `inapplicable` when the feature never shows that state.
- A `covered` item needs a `note` with the measured or observed value and at
  least one citation. A verdict such as "passes" or "no issues" is not a
  value.
- For a `GUI` surface only, add `accessibility`, keyed `semantics`, `names`,
  `keyboard`, `focus`, `contrast`, `target`, `responsive` and `motion`, each
  `covered` or `not observed`. Any other surface gets no `accessibility` key.
- When the feature uses AI, set `usesAi` to true and add `trust`, keyed
  `consent`, `disclosure`, `cost`, `uncertainty`, `verification`, `undo` and
  `control`, each `covered` or `not observed`. Otherwise leave `trust` out.
- A citation is `{ "path", "line"?, "end"?, "anchor"? }`, repository-relative.
  The script checks every one against the checkout.

Change nothing in the checkout, ask no one anything, and commit nothing.
