Classify one pair of documentation claims.

Read `$PACK_DIR/agents/doc-conflict-judge.md` and follow its rules and its four
verdicts. Do not use its output format: this workflow reads a file instead.

The pair is in `$ARTIFACTS_DIR/current.json`: an `id`, then claims `a` and `b`,
each with `file`, `startLine`, `endLine`, `heading` and `text`. Judge the two
`text` fields alone. Do not open the files they came from.

Write `$ARTIFACTS_DIR/verdict.json` as one JSON object and write nothing else:

```json
{ "verdict": "CONFLICT", "evidenceA": "...", "evidenceB": "...", "why": "..." }
```

- `verdict`: `CONFLICT`, `DUPLICATE`, `STALE-SUBSET` or `UNRELATED`.
- `evidenceA` and `evidenceB`: for a `CONFLICT`, the contradicting words copied
  exactly from claim `a`'s text and from claim `b`'s text. A script checks each
  quote against the text and discards the verdict when one does not match. For
  any other verdict, the deciding words, or `""` for `UNRELATED`.
- `why`: one sentence.
