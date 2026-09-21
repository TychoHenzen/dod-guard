import {
  PracticeFailure,
  reconciliationTimeoutMs,
} from "./practice-browser-config.mjs";

export function call({ page, endpoint, session, tab, route, body }) {
  return page.evaluate(
    async ({
      endpoint: url,
      session: sessionId,
      tab: tabId,
      route: path,
      body: requestBody,
    }) => {
      const response = await fetch(`${url}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-code-explorer-session": sessionId,
          "x-code-explorer-tab": tabId,
        },
        body: JSON.stringify(requestBody),
      });
      return { status: response.status, payload: await response.json() };
    },
    { endpoint, session, tab, route, body },
  );
}

export function expectSuccess(result, operation) {
  if (result.status !== 200 || result.payload?.code)
    throw new PracticeFailure(`practice_${operation}_failed`);
  return result.payload;
}

export function sameLocation(actual, expected, path) {
  return (
    actual?.path === path &&
    actual?.range?.start?.line === expected?.start?.line &&
    actual?.range?.start?.character === expected?.start?.character &&
    actual?.range?.end?.line === expected?.end?.line &&
    actual?.range?.end?.character === expected?.end?.character
  );
}

export async function waitForGeneration({
  page,
  endpoint,
  session,
  tab,
  startGeneration,
}) {
  const deadline = Date.now() + reconciliationTimeoutMs;
  while (Date.now() <= deadline) {
    const status = expectSuccess(
      await call({
        page,
        endpoint,
        session,
        tab,
        route: "/api/status",
        body: { action: "status" },
      }),
      "status",
    );
    const generation = status.data?.current_generation;
    if (Number.isInteger(generation) && generation > startGeneration)
      return status;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new PracticeFailure("practice_reconciliation_timeout");
}
