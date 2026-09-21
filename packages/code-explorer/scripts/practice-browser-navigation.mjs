import {
  PracticeFailure,
  readinessTimeoutMs,
} from "./practice-browser-config.mjs";
import {
  request,
  requestBody,
  successfulRequest,
} from "./practice-browser-requests.mjs";
import {
  followCaller,
  moveHistory,
  recordFocus,
} from "./practice-browser-navigation-steps.mjs";

const delay = () =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, 250));

async function findCandidate({ context, oracle }) {
  let search;
  let candidate;
  const searchDeadline = Date.now() + readinessTimeoutMs;
  do {
    search = await request(
      context,
      "/api/search",
      requestBody({ query: oracle.symbols.helper.name }),
    );
    candidate = search.payload?.data?.candidates?.find(
      (item) => item.name === oracle.symbols.helper.name,
    );
    if (search.status === 200 && candidate?.identity) break;
    await delay();
  } while (Date.now() <= searchDeadline);
  return { search, candidate };
}

function recordSearch(search, candidate, evidence) {
  evidence.operation_states.search = search.payload?.code ?? "missing";
  if (!candidate?.identity) throw new PracticeFailure("practice_search_failed");
  evidence.operation_states.search = search.payload.state;
}

export async function navigate({
  context,
  oracle,
  evidence,
}) {
  const { search, candidate } = await findCandidate({ context, oracle });
  recordSearch(search, candidate, evidence);
  const focusPayload = await successfulRequest({
    context,
    route: "/api/focus",
    body: requestBody({ symbol_id: candidate.identity }),
    operation: "focus",
  });
  const { focus, handle } = recordFocus(focusPayload, oracle, evidence);
  const caller = await followCaller({
    context,
    focus,
    handle,
    oracle,
    evidence,
  });
  await moveHistory({ context, focus, caller, evidence });
  return { candidate, focus, handle };
}
