import { sameRepository } from "./project-reads.mjs";

// The pull request numbers the target Issue items list under Linked pull requests, for the target
// repository only. A same-numbered pull request of another repository does not link.
function linkedNumbers(targets, repository) {
  const numbers = new Set();
  for (const { item } of targets) {
    // ASSUMPTION: a target item without a Linked pull requests field, such as a non-Issue item, links nothing.
    const field = item.fields.find(({ name }) => name === "Linked pull requests");
    for (const reference of field?.value ?? []) {
      if (sameRepository(reference.repository, repository)) {
        numbers.add(reference.number);
      }
    }
  }
  return numbers;
}

// Open pull requests that no target Issue item lists, in the order they were read. Unlinked means no
// target Issue item lists the pull request; Project pull request items are not read.
export function unlinkedPullRequests(openPulls, targets, repository) {
  const linked = linkedNumbers(targets, repository);
  return openPulls.filter(({ number }) => !linked.has(number)).map(({ number, headRef }) => ({ number, headRef }));
}
