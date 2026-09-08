import { randomUUID } from "node:crypto";
import {
  PracticeFailure,
  readinessTimeoutMs,
} from "./practice-browser-config.mjs";
import {
  call,
  expectSuccess,
  sameLocation,
} from "./practice-browser-transport.mjs";

const delay = () =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, 250));

function searchState(search) {
  return search?.payload?.code ?? search?.payload?.state ?? "missing";
}

async function findCandidate({ page, endpoint, session, tab, oracle }) {
  let search;
  let candidate;
  const searchDeadline = Date.now() + readinessTimeoutMs;
  do {
    search = await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/search",
      body: { request_id: randomUUID(), query: oracle.symbols.helper.name },
    });
    candidate = search.payload?.data?.candidates?.find(
      (item) => item.name === oracle.symbols.helper.name,
    );
    if (search.status === 200 && candidate?.identity) break;
    await delay();
  } while (Date.now() <= searchDeadline);
  return { search, candidate };
}

function recordSearch(search, candidate, evidence) {
  evidence.operation_states.search = searchState(search);
  const searchPayload = expectSuccess(search, "search");
  if (!candidate?.identity) throw new PracticeFailure("practice_search_failed");
  evidence.operation_states.search = searchPayload.state;
}

function recordFocus(focusPayload, oracle, evidence) {
  const focus = focusPayload.data;
  const handle = focus?.handles?.find(
    (item) => item.name === oracle.symbols.helper.name,
  );
  if (!focus?.view_id || !handle?.handle)
    throw new PracticeFailure("practice_focus_failed");
  const expectedDefinition = {
    path: oracle.source_file,
    range: oracle.symbols.helper.declaration,
  };
  const actualDefinition = { path: focus.path, range: focus.range };
  evidence.expected_locations.helper_definition = expectedDefinition;
  evidence.actual_locations.helper_definition = actualDefinition;
  if (
    !sameLocation(
      actualDefinition,
      oracle.symbols.helper.declaration,
      oracle.source_file,
    )
  )
    throw new PracticeFailure("practice_oracle_mismatch");
  evidence.operation_states.focus = focusPayload.state;
  return { focus, handle };
}

async function followCaller({
  page,
  endpoint,
  session,
  tab,
  focus,
  handle,
  oracle,
  evidence,
}) {
  const followPayload = expectSuccess(
    await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/follow",
      body: {
        request_id: randomUUID(),
        view_id: focus.view_id,
        handle: handle.handle,
        relation: "callers",
      },
    }),
    "follow",
  );
  evidence.operation_states.follow = followPayload.state;
  const caller = followPayload.data?.candidates?.find(
    (item) => item.external === false && item.call_site,
  );
  if (!caller) throw new PracticeFailure("practice_follow_failed");
  const expectedCallSite = {
    path: oracle.source_file,
    range: oracle.relations.callers.callers[0].call_site,
  };
  evidence.expected_locations.helper_call_site = expectedCallSite;
  evidence.actual_locations.helper_call_site = caller.call_site;
  if (
    !sameLocation(
      caller.call_site,
      oracle.relations.callers.callers[0].call_site,
      oracle.source_file,
    )
  )
    throw new PracticeFailure("practice_oracle_mismatch");
  return caller;
}

async function moveHistory({
  page,
  endpoint,
  session,
  tab,
  focus,
  caller,
  evidence,
}) {
  const backPayload = expectSuccess(
    await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/history",
      body: { request_id: randomUUID(), action: "back" },
    }),
    "back",
  );
  const forwardPayload = expectSuccess(
    await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/history",
      body: { request_id: randomUUID(), action: "forward" },
    }),
    "forward",
  );
  if (
    backPayload.data?.view_id !== focus.view_id ||
    forwardPayload.data?.view_id !== caller.view_id
  )
    throw new PracticeFailure("practice_history_failed");
  evidence.operation_states.back = backPayload.state;
  evidence.operation_states.forward = forwardPayload.state;
}

export async function navigate({
  page,
  endpoint,
  session,
  tab,
  oracle,
  evidence,
}) {
  const { search, candidate } = await findCandidate({
    page,
    endpoint,
    session,
    tab,
    oracle,
  });
  recordSearch(search, candidate, evidence);
  const focusPayload = expectSuccess(
    await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/focus",
      body: { request_id: randomUUID(), symbol_id: candidate.identity },
    }),
    "focus",
  );
  const { focus, handle } = recordFocus(focusPayload, oracle, evidence);
  const caller = await followCaller({
    page,
    endpoint,
    session,
    tab,
    focus,
    handle,
    oracle,
    evidence,
  });
  await moveHistory({ page, endpoint, session, tab, focus, caller, evidence });
  return { candidate, focus, handle };
}
