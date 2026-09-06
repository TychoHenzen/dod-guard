// code-explorer-manager.mjs - project-scoped in-process Code Explorer lifecycle.

import { randomUUID } from "node:crypto";
import { HttpError } from "./http-error.mjs";

const MAX_RUNTIMES = 8;
const IDLE_MS = 30 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function identityKey(projectPath, identity) {
  return `${projectPath}\u0000${String(identity)}`;
}

function capacityError() {
  const error = new HttpError(503, "code_explorer_capacity");
  error.retryable = true;
  return error;
}

function shuttingDownError() {
  return new HttpError(503, "dashboard_shutting_down");
}

function shutdownTimeoutError() {
  return new Error("dashboard_shutdown_timeout");
}

export function createCodeExplorerManager({
  projectIdentity,
  origin,
  start,
  createId = randomUUID,
  now = () => performance.now(),
  shutdownTimeoutMs = SHUTDOWN_TIMEOUT_MS,
} = {}) {
  const records = new Map();
  let shuttingDown = false;
  let shutdownPromise;
  let admission = Promise.resolve();

  async function remove(record) {
    if (records.get(record.key) === record) records.delete(record.key);
    record.controller?.abort();
    if (record.state === "starting") {
      try {
        await record.promise;
      } catch {}
      return;
    }
    await record.runtime?.close();
  }

  function currentOrigin() {
    return typeof origin === "function" ? origin() : origin;
  }

  function stalePathRecords(projectPath, key) {
    return [...records.values()].filter((record) => record.projectPath === projectPath && record.key !== key);
  }

  async function reclaimCapacity() {
    if (records.size < MAX_RUNTIMES) return;
    const cutoff = now() - IDLE_MS;
    const candidates = [...records.values()]
      .filter((record) => record.state === "open" && record.lastUsedAt <= cutoff)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    if (candidates.length === 0) throw capacityError();
    await remove(candidates[0]);
  }

  function publicResult(record, reused) {
    return { state: "open", url: new URL(record.routePrefix, currentOrigin()).href, reused };
  }

  function createStartingRecord(projectPath, identity, key) {
    const record = {
      key,
      projectPath,
      identity,
      routePrefix: `/code-explorer/${createId()}/`,
      state: "starting",
      runtime: null,
      lastUsedAt: null,
      controller: new AbortController(),
    };
    records.set(key, record);
    record.promise = Promise.resolve(
      start({ projectPath, identity, origin: currentOrigin(), signal: record.controller.signal }),
    )
      .then(async (runtime) => {
        if (shuttingDown || records.get(key) !== record) {
          await runtime.close();
          throw shuttingDownError();
        }
        record.runtime = runtime;
        record.state = "open";
        record.lastUsedAt = now();
        return publicResult(record, false);
      })
      .catch((error) => {
        if (records.get(key) === record) records.delete(key);
        throw error;
      });
    return record;
  }

  async function reserve(projectPath) {
    const identity = projectIdentity(projectPath);
    const key = identityKey(projectPath, identity);
    const stale = stalePathRecords(projectPath, key);
    if (stale.length > 0) await Promise.all(stale.map(remove));
    const existing = records.get(key);
    if (existing?.state === "starting") return { pending: existing.promise };
    if (existing?.state === "open") {
      existing.lastUsedAt = now();
      return { result: publicResult(existing, true) };
    }
    await reclaimCapacity();
    return { pending: createStartingRecord(projectPath, identity, key).promise };
  }

  function launch(projectPath) {
    if (shuttingDown) return Promise.reject(shuttingDownError());
    const reservation = admission.then(() => reserve(projectPath));
    admission = reservation.then(
      () => undefined,
      () => undefined,
    );
    return reservation.then(({ pending, result }) => pending ?? result);
  }

  function resolve(pathname) {
    const record = [...records.values()].find(
      (candidate) => candidate.state === "open" && pathname.startsWith(candidate.routePrefix),
    );
    if (!record) return null;
    const relative = pathname.slice(record.routePrefix.length);
    record.lastUsedAt = now();
    return { runtime: record.runtime, path: relative ? `/${relative}` : "/" };
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    for (const record of records.values()) record.controller?.abort();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(shutdownTimeoutError()), shutdownTimeoutMs);
    });
    const cleanup = admission.then(() => Promise.allSettled([...records.values()].map(remove)));
    shutdownPromise = Promise.race([cleanup, deadline])
      .finally(() => clearTimeout(timer))
      .then(() => undefined);
    return shutdownPromise;
  }

  return { launch, resolve, shutdown, records: () => [...records.values()] };
}
