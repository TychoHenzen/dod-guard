import { sameRepository } from "./project-reads.mjs";

// The pull request numbers the target Issue items list under Linked pull requests, for the target
// repository only. A same-numbered pull request of another repository does not link.
// ASSUMPTION: a target item without a Linked pull requests field, such as a non-Issue item, links nothing.
function linkedReferences(item) {
  const field = item.fields.find(({ name }) => name === "Linked pull requests");
  return field?.value ?? [];
}

function linkedNumbers(targets, repository) {
  const references = targets.flatMap(({ item }) => linkedReferences(item));
  const sameRepo = references.filter((reference) => sameRepository(reference.repository, repository));
  return new Set(sameRepo.map((reference) => reference.number));
}

// Open pull requests that no target Issue item lists, in the order they were read. Unlinked means no
// target Issue item lists the pull request; Project pull request items are not read.
export function unlinkedPullRequests(openPulls, targets, repository) {
  const linked = linkedNumbers(targets, repository);
  return openPulls.filter(({ number }) => !linked.has(number)).map(({ number, headRef }) => ({ number, headRef }));
}
