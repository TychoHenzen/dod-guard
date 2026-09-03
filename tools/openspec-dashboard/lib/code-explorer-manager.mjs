// code-explorer-manager.mjs - project-scoped Code Explorer lifecycle and direct health probe.

import { request as nodeRequest } from "node:http";
import { HttpError } from "./http-error.mjs";

const MAX_CHILDREN = 8;
const IDLE_MS = 30 * 60 * 1000;
const PROBE_LIMIT = 65_536;
const PROBE_TIMEOUT_MS = 1_000;

function normalizeLoopback(address) {
  return address === "::ffff:127.0.0.1" ? "127.0.0.1" : address;
}

/** Probe the child directly. This intentionally has no proxy or redirect layer. */
export function probeCodeExplorer(urlText, { request = nodeRequest } = {}) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    return Promise.resolve(false);
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.search || url.hash) {
    return Promise.resolve(false);
  }

  const port = Number(url.port);
  const host = `127.0.0.1:${port}`;
  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let req;
    try {
      req = request(
        { host: "127.0.0.1", port, path: "/", method: "GET", headers: { Host: host }, agent: false },
        (response) => {
          if (!connected || response.statusCode !== 200) {
            response.resume?.();
            finish(false);
            return;
          }
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > PROBE_LIMIT) {
              response.destroy();
              finish(false);
            }
          });
          response.on("error", () => finish(false));
          response.on("end", () => finish(true));
        },
      );
      req.on("socket", (socket) => {
        const validateSocket = () => {
          if (normalizeLoopback(socket.remoteAddress) !== "127.0.0.1") {
            req.destroy();
            finish(false);
            return;
          }
          connected = true;
        };
        if (socket.connecting) {
          socket.once("connect", validateSocket);
          socket.once("error", () => finish(false));
          return;
        }
        validateSocket();
      });
      req.on("error", () => finish(false));
      req.setTimeout?.(PROBE_TIMEOUT_MS, () => {
        req.destroy();
        finish(false);
      });
      req.end();
    } catch {
      finish(false);
    }
  });
}

function isLive(child) {
  return Boolean(child) && child.exitCode === null && child.signalCode === null;
}

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

function waitForExit(child) {
  if (!isLive(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    child.once?.("exit", done);
    child.once?.("error", done);
  });
}

/**
 * Keep one record per canonical project path plus filesystem identity.
 * `start` returns `{ child, url }`; its readiness and shutdown wiring live at the API boundary.
 */
export function createCodeExplorerManager({
  projectIdentity,
  start,
  probe = probeCodeExplorer,
  stop = async () => {},
  now = () => performance.now(),
} = {}) {
  const records = new Map();
  let shuttingDown = false;
  let shutdownPromise;

  async function remove(record) {
    if (records.get(record.key) !== record) return;
    records.delete(record.key);
    await stop(record);
  }

  function stalePathRecords(projectPath, key) {
    return [...records.values()].filter((record) => record.projectPath === projectPath && record.key !== key);
  }

  async function reclaimCapacity() {
    if (records.size < MAX_CHILDREN) return;
    const cutoff = now() - IDLE_MS;
    const candidates = [...records.values()]
      .filter((record) => record.state === "open" && record.lastUsedAt <= cutoff)
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    if (candidates.length === 0) throw capacityError();
    await remove(candidates[0]);
  }

  function createStartingRecord(projectPath, identity, key) {
    let settle;
    let reject;
    let finishStopped;
    const record = {
      key,
      projectPath,
      identity,
      state: "starting",
      child: null,
      url: null,
      lastUsedAt: null,
      promise: new Promise((resolve, rejectPromise) => {
        settle = resolve;
        reject = rejectPromise;
      }),
      reject: (error) => reject(error),
      stopped: new Promise((resolve) => {
        finishStopped = resolve;
      }),
      finishStopped: () => finishStopped(),
    };
    records.set(key, record);
    try {
      Promise.resolve(start({ projectPath, identity }))
        .then(({ child, url }) => {
          if (records.get(key) !== record) return;
          record.child = child;
          if (shuttingDown) {
            child.kill?.();
            return waitForExit(child).then(() => {
              records.delete(key);
              record.finishStopped();
            });
          }
          record.url = url;
          record.state = "open";
          record.lastUsedAt = now();
          settle({ state: "open", url, reused: false });
        })
        .catch((error) => {
          if (records.get(key) === record) records.delete(key);
          if (shuttingDown) record.finishStopped();
          else reject(error);
        });
    } catch (error) {
      records.delete(key);
      if (shuttingDown) record.finishStopped();
      else reject(error);
    }
    return record;
  }

  async function launchAfterStale(projectPath, identity, key) {
    const existing = records.get(key);
    if (existing?.state === "starting") return existing.promise;
    if (existing?.state === "open") {
      let healthy = false;
      try {
        healthy = isLive(existing.child) && (await probe(existing.url));
      } catch {}
      if (healthy) {
        existing.lastUsedAt = now();
        return { state: "open", url: existing.url, reused: true };
      }
      await remove(existing);
    }
    await reclaimCapacity();
    return createStartingRecord(projectPath, identity, key).promise;
  }

  function launch(projectPath) {
    if (shuttingDown) return Promise.reject(shuttingDownError());
    const identity = projectIdentity(projectPath);
    const key = identityKey(projectPath, identity);
    const stale = stalePathRecords(projectPath, key);
    if (stale.length > 0) return Promise.all(stale.map(remove)).then(() => launchAfterStale(projectPath, identity, key));
    const existing = records.get(key);
    if (existing?.state === "starting") return existing.promise;
    if (!existing) {
      if (records.size < MAX_CHILDREN) return createStartingRecord(projectPath, identity, key).promise;
      return reclaimCapacity().then(() => createStartingRecord(projectPath, identity, key).promise);
    }
    return launchAfterStale(projectPath, identity, key);
  }

  async function stopRecord(record) {
    if (record.state === "starting") {
      // Joined launch callers settle immediately. A child returned later is terminated above.
      record.state = "stopping";
      record.reject(shuttingDownError());
      await record.stopped;
      return;
    }
    if (records.get(record.key) === record) records.delete(record.key);
    record.state = "stopping";
    if (record.child) {
      record.child.kill?.();
      await waitForExit(record.child);
    }
    await stop(record);
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = Promise.all([...records.values()].map(stopRecord)).then(() => undefined);
    return shutdownPromise;
  }

  return { launch, shutdown, records: () => [...records.values()] };
}
