import {
  requestBody,
  successfulRequest,
} from "./practice-browser-requests.mjs";
import { PracticeFailure } from "./practice-browser-config.mjs";
import { sameLocation } from "./practice-browser-transport.mjs";

export function recordFocus(focusPayload, oracle, evidence) {
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

function recordCaller(caller, oracle, evidence) {
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
}

export async function followCaller({
  context,
  focus,
  handle,
  oracle,
  evidence,
}) {
  const followPayload = await successfulRequest({
    context,
    route: "/api/follow",
    body: requestBody({
      view_id: focus.view_id,
      handle: handle.handle,
      relation: "callers",
    }),
    operation: "follow",
  });
  evidence.operation_states.follow = followPayload.state;
  const caller = followPayload.data?.candidates?.find(
    (item) => item.external === false && item.call_site,
  );
  if (!caller) throw new PracticeFailure("practice_follow_failed");
  recordCaller(caller, oracle, evidence);
  return caller;
}

export async function moveHistory({ context, focus, caller, evidence }) {
  const backPayload = await successfulRequest({
    context,
    route: "/api/history",
    body: requestBody({ action: "back" }),
    operation: "back",
  });
  const forwardPayload = await successfulRequest({
    context,
    route: "/api/history",
    body: requestBody({ action: "forward" }),
    operation: "forward",
  });
  if (
    backPayload.data?.view_id !== focus.view_id ||
    forwardPayload.data?.view_id !== caller.view_id
  )
    throw new PracticeFailure("practice_history_failed");
  evidence.operation_states.back = backPayload.state;
  evidence.operation_states.forward = forwardPayload.state;
}
