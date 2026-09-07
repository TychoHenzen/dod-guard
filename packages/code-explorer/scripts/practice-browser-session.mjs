import { randomUUID } from "node:crypto";
import { PracticeFailure, readinessTimeoutMs } from "./practice-browser-config.mjs";
import { call, expectSuccess } from "./practice-browser-transport.mjs";

export async function createSession(page, endpoint) {
  const tab = randomUUID();
  const created = await page.evaluate(
    async ({ endpoint: url, tab: tabId }) => {
      const response = await fetch(`${url}/api/session`, { method: "POST", headers: { "content-type": "application/json", "x-code-explorer-tab": tabId }, body: JSON.stringify({ action: "create", tab_instance_id: tabId, document_start: "new" }) });
      return { status: response.status, payload: await response.json() };
    },
    { endpoint, tab },
  );
  const payload = expectSuccess(created, "session");
  const session = payload.data?.browser_session_id;
  if (typeof session !== "string") throw new PracticeFailure("practice_session_failed");
  return { tab, session, state: payload.state };
}

export async function waitForBackend({ page, endpoint, session, tab, language, evidence }) {
  let status;
  let selectedBackend;
  const readyDeadline = Date.now() + readinessTimeoutMs;
  do {
    status = expectSuccess(await call(page, endpoint, session, tab, "/api/status", { action: "status" }), "status");
    selectedBackend = status.data?.backend_status?.backends?.find((candidate) => candidate.language === language);
    if (["ready", "degraded"].includes(selectedBackend?.state)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  } while (Date.now() <= readyDeadline);
  if (!selectedBackend || !["ready", "degraded"].includes(selectedBackend.state) || selectedBackend.backend_name !== evidence.backend.name || selectedBackend.backend_version !== evidence.backend.version)
    throw new PracticeFailure("practice_prerequisite_failed");
  const startGeneration = status.data?.current_generation;
  if (!Number.isInteger(startGeneration)) throw new PracticeFailure("practice_generation_failed");
  evidence.generations.start = startGeneration;
  evidence.operation_states.status = status.state;
  return startGeneration;
}
