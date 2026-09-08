import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PracticeFailure } from "./practice-browser-config.mjs";
import {
  call,
  expectSuccess,
  waitForGeneration,
} from "./practice-browser-transport.mjs";

function recordRefocus(refocus, evidence) {
  if (refocus.status === 200 && !refocus.payload?.code) {
    evidence.operation_states.refocus = refocus.payload.state;
    return;
  }
  if (refocus.payload?.code === "backend_unavailable") {
    evidence.operation_states.refocus = refocus.payload.code;
    return;
  }
  throw new PracticeFailure("practice_refocus_failed");
}

export async function reconcile({
  page,
  endpoint,
  session,
  tab,
  root,
  oracle,
  evidence,
  startGeneration,
  candidate,
  focus,
  handle,
}) {
  const sourcePath = join(root, ...oracle.source_file.split("/"));
  const original = await readFile(sourcePath, "utf8");
  const changed = original.replaceAll(
    oracle.symbols.helper.name,
    `${oracle.symbols.helper.name}Saved`,
  );
  if (changed === original)
    throw new PracticeFailure("practice_saved_file_failed");
  await writeFile(sourcePath, changed, "utf8");
  evidence.operation_states.saved_file = "written";
  const reconciled = await waitForGeneration({
    page,
    endpoint,
    session,
    tab,
    startGeneration,
  });
  evidence.generations.final = reconciled.data.current_generation;
  evidence.operation_states.reconciliation = reconciled.state;

  const stale = await call({
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
  });
  if (stale.payload?.code !== "stale_view")
    throw new PracticeFailure("practice_stale_failed");
  evidence.operation_states.stale = stale.payload.code;
  const refocus = await call({
    page,
    endpoint,
    session,
    tab,
    route: "/api/focus",
    body: { request_id: randomUUID(), symbol_id: candidate.identity },
  });
  recordRefocus(refocus, evidence);
  const refreshPayload = expectSuccess(
    await call({
      page,
      endpoint,
      session,
      tab,
      route: "/api/status",
      body: { action: "refresh", request_id: randomUUID() },
    }),
    "refresh",
  );
  evidence.operation_states.refresh = refreshPayload.state;
  evidence.generations.final =
    refreshPayload.data?.current_generation ??
    refreshPayload.project_generation;
}
