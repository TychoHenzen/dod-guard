// Builds the shared read context of a closure plan from a queue snapshot.
import { indexSnapshot, preflightHolds } from "../../../../lib/closure-index.mjs";
import { rootsNaming, supersedesRecords } from "../../../../lib/supersedes-record.mjs";
import { createOnceDone } from "./closure-await-done.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";
import { mergeHolds } from "./closure-holds.mjs";

function createContext(snapshot) {
  const index = indexSnapshot(snapshot);
  const deliveries = new Map();
  const delivery = (number) => {
    if (!deliveries.has(number)) deliveries.set(number, judgeDelivery(index, number));
    return deliveries.get(number);
  };
  const { roots, errors: rootErrors } = supersedesRecords(index);
  const rootsOf = (original) => rootsNaming(roots, original);
  // Indexing problems and unsafe relations are holds before any rule runs. A held issue is never
  // closed or set Done because admitClose and admitWrite refuse it, so no rule checks holds itself.
  const holds = mergeHolds([...index.problems, ...rootErrors, ...preflightHolds(index)]);
  return { index, delivery, deliveryOnceDone: createOnceDone(snapshot), roots, rootsOf, closes: [], holds };
}

export { createContext };
