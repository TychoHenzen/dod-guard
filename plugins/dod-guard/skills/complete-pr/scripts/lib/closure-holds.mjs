// The hold ledger of a closure plan: the holds that refuse a close or a Project Done repair,
// and the one rule that admits each write against them.

// One hold per issue, so the reasons found for an issue read as one entry. A hold that names no
// issue stays on its own, because it names no target issue to merge into.
function mergeHolds(holds) {
  const merged = [];
  const byIssue = new Map();
  for (const hold of holds) {
    if (hold.issue === null) {
      merged.push(hold);
      continue;
    }
    if (!byIssue.has(hold.issue)) {
      const entry = { issue: hold.issue, reasons: [] };
      byIssue.set(hold.issue, entry);
      merged.push(entry);
    }
    const entry = byIssue.get(hold.issue);
    for (const reason of hold.reasons) {
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    }
  }
  return merged;
}

// Records reasons against an issue's hold in place, so the reasons for an issue stay in one entry
// with no reason repeated. A hold that names no issue is always its own entry: it has no issue to
// merge into.
function addHold(context, issue, reasons) {
  const entry = context.holds.find((hold) => hold.issue !== null && hold.issue === issue);
  if (entry === undefined) {
    context.holds.push({ issue, reasons: [...new Set(reasons)] });
    return;
  }
  for (const reason of reasons) {
    if (!entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
    }
  }
}

// The one place that decides whether an issue is held for a write. Every close and every Project
// Done repair passes through it. A held issue is refused, and the refusal joins that issue's hold.
function admitWrite(context, issue, refusal) {
  if (context.holds.some((hold) => hold.issue === issue)) {
    addHold(context, issue, [refusal]);
    return false;
  }
  return true;
}

// The only code that appends to context.closes.
function admitClose(context, close) {
  if (!admitWrite(context, close.issue, `${close.rule} close refused: issue is held`)) {
    return false;
  }
  context.closes.push(close);
  return true;
}

function planned(context, number) {
  return context.closes.some((close) => close.issue === number);
}

export { addHold, admitClose, admitWrite, mergeHolds, planned };
