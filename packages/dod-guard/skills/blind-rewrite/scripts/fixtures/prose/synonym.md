Ask a system to entirely rewrite code that sits in its context and it returns a
paraphrase. It relabels a variable, reorders two lines, and reports a rewrite.

Prompt strength does not fix this. A prompt that names the failure in advance
and bans cosmetic edits by name still gets cosmetic edits. Three reasons drive
it, and none of them answer to wording.

1. The original is a magnet. Generation conditions on the text in view.
   A ban does not outrank that conditioning. Deletion does.
2. Bulk flattens effort. A rewrite costs far more output than a tweak. Given
   forty items in one pass, the model spreads its budget and every item gets a tweak.
3. Negative rules give nothing to aim at. "Not a narrator" and "no longer A*"
   name what to shun. With no positive target, the nearest concrete artifact is
   the old code, so the output stays next to it.

This process removes the text, splits the work into single dispatches, and states
the aim in positive terms. It then checks the result against the deleted
original, because a model that failed this way once will report success again.
