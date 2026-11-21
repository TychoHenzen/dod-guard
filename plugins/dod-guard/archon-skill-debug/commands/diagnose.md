Debug the skill `$INPUTS.skill` from the runs that used it.

Read `$PACK_DIR/skills/skill-debug/SKILL.md`. Follow its opening rules, "Words
used here", "Procedure" steps 1, 3, 5, 6 and 7, "Causes" and "Report". Scripts
already did the rest:

- The target SKILL.md in this checkout is named in
  `$ARTIFACTS_DIR/target.json`. Score against that file, and the scripts and
  agent briefs it uses, as this checkout has them.
- The run index is `$ARTIFACTS_DIR/runs.txt`. The pulled runs are listed in
  `$ARTIFACTS_DIR/traces.json`; run `k` is the file `trace-<k>.txt` next to
  it. Every trace is complete, never truncated. Do not run the scripts again
  and do not read transcripts yourself.

Write the standard (Procedure step 1) before you open any trace, and put it at
the top of `$ARTIFACTS_DIR/report.md`. Then the findings, in the Report format,
ordered as Report says. Replace any secret in a quoted step line with
`[redacted]`.

Change nothing in the checkout and ask no one anything. A maintainer accepts
findings on a form, and later sessions make the edits. The two files you write
are `$ARTIFACTS_DIR/report.md` and `$ARTIFACTS_DIR/findings.json`:

```json
{
  "findings": [
    {
      "id": "f1",
      "title": "Skips the dry run when the target is small",
      "cause": "escape hatch",
      "file": "plugins/dod-guard/skills/example/SKILL.md",
      "evidence": "run 1 steps 40-44, run 2 steps 12-15",
      "fix": "In Stage 2, replace 'unless the change is trivial' with 'always'.",
      "expect": "The next run shows a dry-run tool call before any edit."
    }
  ]
}
```

- `cause` is a row name from the Causes table, spelled as it is there.
- `file` is the repository-relative path of the one file the edit goes in:
  the target SKILL.md or an agent brief it dispatches.
- `evidence` cites `run <k> steps <a>-<b>` for every run that shows the
  finding, using the numbers from `traces.json` and the traces. A script
  rejects any finding whose cited steps do not exist.
- `fix` is the edit itself, in the fix shape for its cause, precise enough
  for a session with no other context to make it.
- `expect` is what the next run should show if this one fix holds.
- No finding comes from taste. When nothing diverged, write an empty
  `findings` array and say so in the report.
