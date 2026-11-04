// Binds the parsed records to the pushed head for the post-push proof.

// A lens entry stores no head, so the proof binds one to the head the caller
// supplies. Two places own that rule and must agree: this function gives a
// headless lens the supplied head, and lensRowRemainder in
// convergence-lens-rows.mjs reports a lens whose stored head differs, which
// is how a legacy body that still stores one goes stale.
function bindLensHead(lens, headSha) {
  if (!lens || typeof lens !== "object") {
    return lens;
  }
  if (lens.headSha !== undefined || lens.head !== undefined) {
    return lens;
  }
  return { ...lens, headSha };
}

// Returns the evaluateConvergence input for the post-push proof: the parsed
// records with the observed acceptance matrix and the pushed head. The planned
// matrix is dropped, since observed mode reads only the observed rows. Both the
// lens-ownership record and the review lenses are bound, so
// validateLensOwnershipRecord compares like with like.
function postPushInput({ input, rows, headSha }) {
  const bindAll = (lenses) => lenses.map((lens) => bindLensHead(lens, headSha));
  const lensRecord = input.records["lens-ownership"];
  const records = { ...input.records };
  if (Array.isArray(lensRecord)) {
    records["lens-ownership"] = bindAll(lensRecord);
  }
  return {
    ...input,
    records,
    plannedAcceptanceMatrix: null,
    acceptanceMatrix: rows,
    headSha,
    reviewLenses: bindAll(input.reviewLenses),
  };
}

export { postPushInput };
