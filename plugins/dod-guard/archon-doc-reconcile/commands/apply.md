Apply the doc-reconcile plan in `$ARTIFACTS_DIR/plan.json`. Every decision is
already made; you only edit.

Each entry in `actions` has a `kind`, a `target` claim and a `survivor` claim.
Each claim has `file`, `startLine`, `endLine`, `heading` and `text`.

- `delete`: remove the target's lines, `startLine` through `endLine`, and
  nothing else.
- `point`: replace the target's lines with one line that sends the reader to
  the survivor: a Markdown link to the survivor's file, as a path relative to
  the target's file, with the survivor's heading as the anchor when it has one.
  Keep the line's list marker and indentation. In a table row, replace only the
  repeated cell text and keep the pipes. Never write a sentence that blends the
  two claims.
- In a `.json` manifest the claim is the `description` value on `startLine`.
  Edit that line only. When the edit cannot stay on that line and leave valid
  JSON, leave the file alone.

Work one file at a time, from the highest `startLine` to the lowest, so an edit
never shifts a range still to come. Before each edit, read the range and check
that it still equals the target's `text`, ignoring carriage returns. If it does
not, skip that action.

Edit nothing outside the named lines. Create no files and run no commands. A
script then checks every changed line against the plan, reverts any file with
an edit outside it, and reports every skipped action as undecided.
