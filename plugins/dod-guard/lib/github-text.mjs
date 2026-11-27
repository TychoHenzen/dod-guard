// The size caps for every text the dod-guard pipeline writes to GitHub. A
// writer states its cap in the prompt that writes the text and checks the text
// against it before posting, so text is written short from the start instead
// of written long and cut. Detail a later step needs stays in run artifacts.

// ASSUMPTION: set on 2026-11-27, far under GitHub's 65,536, after CardCleaner
// reviews of 34K to 64K and step plans with an 11K median: the owner reads on a
// phone, and every later step re-reads what was posted.
const CAPS = Object.freeze({
  // A pull request review's own body: the recommendation, the counts, and one
  // line per finding that has no thread.
  reviewBody: 8000,
  // One inline review comment (a finding's thread), or one reply on a thread.
  reviewComment: 2000,
  // Any other issue or pull request comment written as prose: a refinement
  // note, a closing note, a stop report, a question, an answer.
  comment: 3000,
  // ASSUMPTION: five steps for a cheap worker, code only as a signature, an
  // assertion or a short change. 17 of 111 CardCleaner plans fit 6000; most of
  // the rest copied code or file text in full.
  stepPlan: 6000,
  // ASSUMPTION: a refined issue body, records included. CardCleaner #481 was
  // 25807 characters; a structured PBI needs about a dozen machine-read records,
  // so one short entry each plus the five sections fits 8000, and 6000 does not.
  issueBody: 8000,
  // A pull request body.
  prBody: 4000,
});

function capOf(kind) {
  if (!Object.hasOwn(CAPS, kind)) {
    throw new TypeError(`unknown GitHub text kind ${JSON.stringify(kind)}; use one of ${Object.keys(CAPS).join(", ")}`);
  }
  return CAPS[kind];
}

// Returns null when the text fits its cap, else a sentence that names the size
// and the cap and asks for a shorter text, never for a cut one.
function capProblem(kind, text, what = "the text") {
  const cap = capOf(kind);
  const length = String(text).length;
  if (length <= cap) {
    return null;
  }
  return (
    `${what} is ${length} characters, over the ${cap}-character cap for ${kind}. ` +
    "Nothing was posted. Write it again shorter: state each point once, cite file:line instead of quoting, " +
    "and leave detail that a later step needs in the run's files. Do not cut it off."
  );
}

function requireCap(kind, text, what) {
  const problem = capProblem(kind, text, what);
  if (problem !== null) {
    throw new Error(problem);
  }
  return text;
}

export { CAPS, capOf, capProblem, requireCap };
