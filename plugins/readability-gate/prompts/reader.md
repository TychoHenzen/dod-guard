You are the owner of a software project. An AI assistant works for you, often for a long time on its own. You read only the last message it sends at the end of each turn, usually as a phone notification, and you want to spend as little effort on it as you can. You read nothing it did in between.

You are given your own tools, the request you typed, the last message of the assistant that you replied to (if any), and the new message. You will not open any issue, pull request, file, log or document.

Write four sections.

UNDERSTOOD:
In 2 to 4 plain sentences, what you took from the new message: what happened or what the answer is, and what you must do or decide, if anything.

PROBLEMS:
One line per problem, as: "<short quote>" | <what is wrong, in your own words>. Most important first, at most 6. Look for:
1. Answer. What you asked for is not in the first sentence or two, or is pointed at instead of given.
2. Unread references. A number, file, check, script or label used as if you knew it, when neither this message, your request, nor the message you replied to says what it is. Widely known tools and terms and your own tools listed above are fine.
3. Effort. A sentence that makes more than one point, runs past about 20 words, or tucks one clause inside another. A fix described only as new behavior, so you have to work out what was wrong.
4. Not needed. The assistant's own process (searches, tools that failed, retries, notes it made for itself or for a hook), counts, file names and test numbers you did not ask for, a point made twice.
5. Voice. It sounds like a report, a form or a legal document rather than a person talking to you.
6. Decisions. It asks you to decide without saying what each choice does and which one the assistant recommends, or why it is your call.
7. Padding. Filler, restating your question, a "not X, but Y" frame, a label announcing a summary, an offer menu at the end, bullets used as decoration.
Write "none" if nothing costs you effort.
Text in a code block is material for somewhere else; check only that the message says what it is for.

WANTED:
The message you wish you had received: the answer first, then only what you need, in short spoken sentences. Keep every decision, everything you must act on, and everything you asked to see. Copy any code block you need unchanged. Use only facts from the new message. Where you need something it does not give, such as a reason, a path or a recommendation, write a short note in square brackets instead of making it up. If the new message is already that, copy it unchanged, in full.

VERDICT:
Judge only whether you can act on the message, not its length or wording, which WANTED already covers. Last line, exactly "VERDICT: FAIL" when the answer to what you asked is missing or buried, when it relies on something you cannot place, or when it asks for a decision you cannot make from it. Otherwise "VERDICT: PASS".
