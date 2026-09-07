import { randomUUID } from "node:crypto";
import { PracticeFailure, readinessTimeoutMs } from "./practice-browser-config.mjs";
import { call, expectSuccess, sameLocation } from "./practice-browser-transport.mjs";

export async function navigate({ page, endpoint, session, tab, oracle, evidence }) {
  let search;
  let candidate;
  const searchDeadline = Date.now() + readinessTimeoutMs;
  do {
    search = await call(page, endpoint, session, tab, "/api/search", { request_id: randomUUID(), query: oracle.symbols.helper.name });
    candidate = search.payload?.data?.candidates?.find((item) => item.name === oracle.symbols.helper.name);
    if (search.status === 200 && candidate?.identity) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  } while (Date.now() <= searchDeadline);
  evidence.operation_states.search = search?.payload?.code ?? search?.payload?.state ?? "missing";
  const searchPayload = expectSuccess(search, "search");
  if (!candidate?.identity) throw new PracticeFailure("practice_search_failed");
  evidence.operation_states.search = searchPayload.state;

  const focusPayload = expectSuccess(await call(page, endpoint, session, tab, "/api/focus", { request_id: randomUUID(), symbol_id: candidate.identity }), "focus");
  const focus = focusPayload.data;
  const handle = focus?.handles?.find((item) => item.name === oracle.symbols.helper.name);
  if (!focus?.view_id || !handle?.handle) throw new PracticeFailure("practice_focus_failed");
  const expectedDefinition = { path: oracle.source_file, range: oracle.symbols.helper.declaration };
  const actualDefinition = { path: focus.path, range: focus.range };
  evidence.expected_locations.helper_definition = expectedDefinition;
  evidence.actual_locations.helper_definition = actualDefinition;
  if (!sameLocation(actualDefinition, oracle.symbols.helper.declaration, oracle.source_file)) throw new PracticeFailure("practice_oracle_mismatch");
  evidence.operation_states.focus = focusPayload.state;

  const followPayload = expectSuccess(await call(page, endpoint, session, tab, "/api/follow", { request_id: randomUUID(), view_id: focus.view_id, handle: handle.handle, relation: "callers" }), "follow");
  evidence.operation_states.follow = followPayload.state;
  const caller = followPayload.data?.candidates?.find((item) => item.external === false && item.call_site);
  if (!caller) throw new PracticeFailure("practice_follow_failed");
  const expectedCallSite = { path: oracle.source_file, range: oracle.relations.callers.callers[0].call_site };
  evidence.expected_locations.helper_call_site = expectedCallSite;
  evidence.actual_locations.helper_call_site = caller.call_site;
  if (!sameLocation(caller.call_site, oracle.relations.callers.callers[0].call_site, oracle.source_file)) throw new PracticeFailure("practice_oracle_mismatch");

  const backPayload = expectSuccess(await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "back" }), "back");
  const forwardPayload = expectSuccess(await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "forward" }), "forward");
  if (backPayload.data?.view_id !== focus.view_id || forwardPayload.data?.view_id !== caller.view_id) throw new PracticeFailure("practice_history_failed");
  evidence.operation_states.back = backPayload.state;
  evidence.operation_states.forward = forwardPayload.state;
  return { candidate, focus, handle };
}
