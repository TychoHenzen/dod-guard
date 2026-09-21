import { once } from "node:events";
import {
  PracticeFailure,
  readinessTimeoutMs,
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
        /(?:^|\r?\n)Code Explorer: (http:\/\/127\.0\.0\.1:\d+\/)(?:\r?\n|$)/;
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

export async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000)),
  ]);
  if (child.exitCode === null) child.kill();
}
