// Builder-side carry-forward logic for handoff-comment.mjs. A row that declares a
// carryForward keeps a record of it, and each declaration must pass the carry check
// (carry-forward-check.mjs) against the new head before anything is built.

// Without a checkout to read revisions from, every carry-forward is refused.
const refuseCarry = () => ({ ok: false, reason: "no checkout was given, pass --root" });

// The row's carry as the comment holds it. The matrix head is the new head and the diff check passed
// before anything was built, so lib/handoff-matrix.mjs restores both when it reads the row.
function carryRecord(entry) {
  const { fromHead, paths } = entry.carryForward;
  return { fromHead, paths };
}

// Each row that declares a carryForward must hold at the new head, as carryCheck decides.
function carryProblems({ planned, rows, headSha, carryCheck }) {
  const declared = planned.filter((row) => Object.hasOwn(rows[row.id], "carryForward"));
  return declared.flatMap((row) => {
    const carry = rows[row.id].carryForward;
    const verdict = carryCheck({ baseHead: carry.fromHead, newHead: headSha, paths: carry.paths });
    if (verdict.ok) {
      return [];
    }
    return [`row ${row.id} cannot carry forward from ${carry.fromHead}: ${verdict.reason}`];
  });
}

export { carryProblems, carryRecord, refuseCarry };
