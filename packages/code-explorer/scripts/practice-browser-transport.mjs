import { once } from "node:events";
import {
  PracticeFailure,
  readinessTimeoutMs,
  reconciliationTimeoutMs,
} from "./practice-browser-config.mjs";

export function waitForEndpoint(child) {
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const finish = (callback) => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
      callback();
    };
    const onData = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-4096);
      const endpointPattern =
        /(?:^|\r?\n)Code Explorer: (http:\/\/127\.0\.0\.1:\d+\/)\r?(?:\n|$)/;
      const match = endpointPattern.exec(output);
      if (match) finish(() => resolvePromise(match[1].slice(0, -1)));
    };
    const onError = () =>
      finish(() => reject(new PracticeFailure("practice_start_failed")));
    const onExit = () =>
      finish(() => reject(new PracticeFailure("practice_start_failed")));
    const timer = setTimeout(
      () => finish(() => reject(new PracticeFailure("practice_start_failed"))),
      readinessTimeoutMs,
    );
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

export async function call({ page, endpoint, session, tab, route, body }) {
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

export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000)),
  ]);
  if (child.exitCode === null) child.kill();
}
