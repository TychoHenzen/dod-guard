// Builds the shared read context of a closure plan from a queue snapshot.
import { indexSnapshot, issueFor, preflightHolds } from "../../../../lib/closure-index.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";
import { mergeHolds } from "./closure-holds.mjs";
import { parseSupersedes } from "./closure-records.mjs";

function createContext(snapshot) {
  const index = indexSnapshot(snapshot);
  const deliveries = new Map();
  const delivery = (number) => {
    if (!deliveries.has(number)) deliveries.set(number, judgeDelivery(index, number));
    return deliveries.get(number);
  };
  const roots = new Map();
  const rootErrors = [];
  for (const number of index.order) {
    const parsed = parseSupersedes(issueFor(index, number)?.body, index.repository);
    if (parsed.error) rootErrors.push({ issue: number, reasons: [parsed.error] });
    else if (parsed.numbers.length > 0) roots.set(number, parsed.numbers);
  }
  const rootsOf = (original) => [...roots].filter(([, numbers]) => numbers.includes(original)).map(([root]) => root);
  // Indexing problems and unsafe relations are holds before any rule runs. A held issue is never
  // closed or set Done because admitClose and admitWrite refuse it, so no rule checks holds itself.
  const holds = mergeHolds([...index.problems, ...rootErrors, ...preflightHolds(index)]);
  return { index, delivery, roots, rootsOf, closes: [], holds };
}

export { createContext };
