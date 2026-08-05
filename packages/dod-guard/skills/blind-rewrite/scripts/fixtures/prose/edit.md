Ask a model to fully rewrite code that sits in its context and it returns a
paraphrase. It renames a variable, reorders two lines and reports a rewrite.

Instruction strength does not fix this. A prompt that names the failure in advance
and bans cosmetic edits by name still gets cosmetic edits. Three causes drive it,
none of them answer to wording.

1. The original is an attractor. Generation conditions on the text in context.
   A prohibition does not outrank that conditioning. Removal does.
2. Bulk collapses effort. A rewrite costs much more output than an edit. Given
   forty items in one pass, the model spreads its budget and every item gets an edit.
3. Negative specs give nothing to aim at. "Not a narrator" and "no longer A*"
   name what to avoid. With no positive target, the nearest concrete artifact is
   the old code, so the output stays right next to it.

This workflow removes the text, splits the work into single dispatches and states
the target in positive terms. It then measures the result against the deleted
original, because a model that failed this way once will report success again.
