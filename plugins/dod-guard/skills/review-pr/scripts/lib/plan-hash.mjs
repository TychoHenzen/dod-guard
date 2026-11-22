// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { createHash } from "node:crypto";

function compareSlots(left, right) {
  if (left.slot === right.slot) {
    return 0;
  }
  return left.slot < right.slot ? -1 : 1;
}

// The hash covers what the investigators were asked, never the statuses saved
// after verification, so saving a status leaves it unchanged.
function canonicalEntry(entry) {
  const asked = entry.questions?.map((q) => [q.id, q.lens, q.question, q.files]) ?? null;
  const excluded = entry.excluded ? [entry.excluded.lens, entry.excluded.reason] : null;
  return [entry.slot, asked, excluded];
}

function planHash(plan) {
  const entries = [...plan].sort(compareSlots).map(canonicalEntry);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 16);
}

export { planHash };
