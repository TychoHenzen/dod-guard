// launch-http.mjs - capability and request boundary for the one launch route.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http-error.mjs";

export const LAUNCH_PATH = /^\/api\/project\/(\d+)\/code-explorer$/;
const LIMIT = 1024;

export function createCapabilities(random = randomBytes) {
  return { browser: random(32).toString("hex"), replacement: random(32).toString("hex") };
}

function capabilityMatches(actual, expected) {
  if (typeof actual !== "string" || actual.length !== expected.length || !/^[0-9a-f]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function assertLaunchRequest(req, { capability, host, origin }) {
  if (req.method !== "POST" || !LAUNCH_PATH.test(req.urlPath) || req.headers.host !== host || req.headers.origin !== origin) {
    throw new HttpError(400, "invalid_launch_request");
  }
  if (!capabilityMatches(req.headers["x-openspec-dashboard-capability"], capability)) {
    throw new HttpError(403, "invalid_dashboard_capability");
  }
  if (req.headers["content-type"] !== "application/json") throw new HttpError(400, "invalid_launch_request");
}

/** Read only a previously authorized launch body. The counter is byte based, not decoded-text based. */
export function readLaunchBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMIT) {
        req.pause();
        reject(new HttpError(413, "launch_request_limit"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(value);
      } catch {
        reject(new HttpError(400, "invalid_launch_request"));
      }
    });
    req.on("error", reject);
  });
}
