Run a wiring audit of the feature described in `$ARTIFACTS_DIR/request.md`
against this checkout.

Read `$PACK_DIR/skills/wiring-audit/SKILL.md` and
`$PACK_DIR/standards/working-defaults.md`, and follow the skill. The PBI and
its acceptance criteria are in `$ARTIFACTS_DIR/issue.json` when that file
exists. Read the repository's own instructions too.

If `$ARTIFACTS_DIR/feedback.md` exists, a script rejected your previous
findings for the reasons it lists. Fix each one; a reason is a fact about the
checkout, so check it rather than argue with it.

Write your findings, and nothing else, to `$ARTIFACTS_DIR/findings.json`. A
script renders the skill's report from it, so put each answer in its field
and none in the prose of another:

```json
{
  "user": "who the feature is for",
  "task": "the primary task that user has",
  "boundary": "user-facing",
  "boundaryNote": "why, from the request, the PBI or the repository",
  "boundaryEvidence": [{ "path": "README.md", "line": 12 }],
  "stages": {
    "discovery": "verified coverage for this stage, or why none applies",
    "setup": "...",
    "entry": "...",
    "inputs": "...",
    "result": "...",
    "failure": "...",
    "recovery": "..."
  },
  "findings": [
    {
      "tag": "required",
      "surface": "the --dry-run flag in the CLI help",
      "status": "missing",
      "impact": "what the user cannot do",
      "evidence": [{ "path": "src/cli.ts", "line": 40, "end": 58, "anchor": "options" }],
      "searched": { "identifiers": ["--dry-run", "dryRun"], "paths": ["src", "README.md", "docs", "package.json"] },
      "limits": "what you could not check",
      "next": "the smallest change that closes the gap",
      "verification": "how to confirm the change worked"
    }
  ]
}
```

- `boundary` is `user-facing`, `unverified` or `not applicable`. Use
  `not applicable` only with repository evidence that the behavior is
  intentionally internal, cited in `boundaryEvidence`.
- `tag` is `required`, `optional` or `unverified`. `status` is `verified`,
  `missing`, `contradicted`, `unverified` or `not applicable`.
- A citation is `{ "path", "line"?, "end"?, "anchor"? }`. The path is
  repository-relative. The anchor is a heading, symbol, route, command or key
  that appears at the cited lines, or anywhere in the file without lines.
  The script checks every citation against the checkout.
- A `verified` or `contradicted` surface needs at least one citation.
- A `missing` surface needs `searched`: each identifier you searched for and
  every path you searched. The script searches those paths again and rejects
  the finding if an identifier is there. A path that does not exist proves
  nothing; with no searchable location left, the surface is `unverified`.

Change nothing in the checkout, ask no one anything, and commit nothing.
