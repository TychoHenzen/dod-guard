import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PracticeFailure } from "./practice-browser-config.mjs";
import {
  request,
  requestBody,
  successfulRequest,
} from "./practice-browser-requests.mjs";
import { waitForGeneration } from "./practice-browser-transport.mjs";

export async function saveAndReconcile({
  context,
  root,
  oracle,
  startGeneration,
  evidence,
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
  const reconciled = await waitForGeneration({ ...context, startGeneration });
  evidence.generations.final = reconciled.data.current_generation;
  evidence.operation_states.reconciliation = reconciled.state;
}

export async function assertStaleView({ context, focus, handle, evidence }) {
  const stale = await request(
    context,
    "/api/follow",
    requestBody({
      view_id: focus.view_id,
      handle: handle.handle,
      relation: "callers",
    }),
  );
  if (stale.payload?.code !== "stale_view")
    throw new PracticeFailure("practice_stale_failed");
  evidence.operation_states.stale = stale.payload.code;
}

export async function refocus({ context, candidate, evidence }) {
  const refocusResult = await request(
    context,
    "/api/focus",
    requestBody({ symbol_id: candidate.identity }),
  );
  if (refocusResult.status === 200 && !refocusResult.payload?.code) {
    evidence.operation_states.refocus = refocusResult.payload.state;
    return;
  }
  if (refocusResult.payload?.code === "backend_unavailable") {
    evidence.operation_states.refocus = refocusResult.payload.code;
    return;
  }
  throw new PracticeFailure("practice_refocus_failed");
}

export async function refresh({ context, evidence }) {
  const refreshPayload = await successfulRequest({
    context,
    route: "/api/status",
    body: requestBody({ action: "refresh" }),
    operation: "refresh",
  });
  evidence.operation_states.refresh = refreshPayload.state;
  evidence.generations.final =
    refreshPayload.data?.current_generation ??
    refreshPayload.project_generation;
}
