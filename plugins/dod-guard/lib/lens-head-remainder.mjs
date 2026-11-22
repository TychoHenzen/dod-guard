// A lens-ownership entry stores no head. Refinement runs before any push, so a
// stored head can only be a guess, and the post-push proof reports every lens
// whose stored head differs from the pushed head as stale. Pure; the refinement
// proof applies it and the post-push and finalization proofs do not.
const HEAD_FIELDS = ["headSha", "head"];

function lensLabel(lens, index) {
  const id = typeof lens?.id === "string" ? lens.id.trim() : "";
  return id || String(index + 1);
}

function storedHeadFields(lens) {
  if (!lens || typeof lens !== "object") return [];
  return HEAD_FIELDS.filter((field) => lens[field] !== undefined);
}

function lensRemainder(lens, index) {
  const label = lensLabel(lens, index);
  return storedHeadFields(lens).map((field) => `lens-ownership entry ${label} stores ${field}; store no head`);
}

function lensHeadRemainder(lenses) {
  if (!Array.isArray(lenses)) return [];
  return lenses.flatMap(lensRemainder);
}

export { lensHeadRemainder };
