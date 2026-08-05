Telling a model to rewrite code it can already see rarely produces a real
rewrite. You get a light edit dressed up as one. A variable is renamed, two
lines are swapped, and a claim of success is attached to work that barely moved.

Sharper wording in the prompt does not solve this. Even an instruction that
predicts the failure and forbids cosmetic changes by name still comes back
cosmetic. Three separate mechanisms produce that outcome, and none of them
respond to better phrasing.

First, the source code sitting in context pulls generation toward itself. No
amount of prohibition in the prompt outweighs that pull. Only taking the text
away breaks it. Second, many rewrites requested together spread the model's
effort thin. A real rewrite costs more output than an edit does. Under that
budget pressure every item degrades to an edit. Third, telling the model what
not to do gives it no destination. "Do not sound like a narrator" is one such
instruction. Lacking a positive target, the only concrete thing nearby is the
original code, so the result drifts back toward it.

The fix follows from the diagnosis. Delete the source before asking for the
rewrite. Hand out the work one dispatch at a time rather than in bulk.
Describe the destination in positive terms instead of listing what to avoid.
Then check the output against a saved copy of what was removed. A model that
faked a rewrite once is likely to claim success again.
