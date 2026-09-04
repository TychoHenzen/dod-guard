#!/usr/bin/env node
// serve.mjs - start the quality dashboard on the loopback interface.
//
// Usage: node tools/openspec-dashboard/serve.mjs
//
// Environment:
//   OPENSPEC_DASHBOARD_PORT   preferred port, default 4400

import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./lib/api.mjs";
import { createCodeExplorerManager } from "./lib/code-explorer-manager.mjs";
import { discoverCodeExplorer, startCodeExplorer } from "./lib/code-explorer-launch.mjs";
import { createDashboardOwnership } from "./lib/dashboard-ownership.mjs";
import { createProjectIdentity } from "./lib/project-identity.mjs";
import { createQualityReportRefresher } from "./lib/quality-report.mjs";
import { assertLaunchRequest, createCapabilities, LAUNCH_PATH, readLaunchBody } from "./lib/launch-http.mjs";
import { launchFailure } from "./lib/launch-result.mjs";
import { createStore } from "./lib/registry.mjs";
import { serveStatic } from "./lib/static.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dir, "public");
const MONOREPO_ROOT = dirname(dirname(__dir));
const QUALITY_GUARD_BUNDLE = join(MONOREPO_ROOT, "packages", "quality-guard", "dist", "bundle.js");
const HOST = "127.0.0.1";
const capabilities = createCapabilities();
const FIRST_PORT = Number(process.env.OPENSPEC_DASHBOARD_PORT ?? 4400);
const PORT_ATTEMPTS = 20;

let acceptingLaunches = false;
const projectIdentity = createProjectIdentity();
let codeExplorerEntry;
try {
  codeExplorerEntry = discoverCodeExplorer({ monorepoRoot: MONOREPO_ROOT });
} catch {
  // The dashboard can still read projects when Code Explorer is not installed.
  codeExplorerEntry = null;
}
const children = createCodeExplorerManager({
  projectIdentity: projectIdentity.identity,
  start: async ({ projectPath }) => {
    if (!codeExplorerEntry) throw new Error("code_explorer_unavailable");
    return startCodeExplorer({ entry: codeExplorerEntry, projectPath, monorepoRoot: MONOREPO_ROOT });
  },
});
const handle = createApi({
  store: createStore(),
  launchAdmission: () => acceptingLaunches,
  launchCodeExplorer: (projectPath) => children.launch(projectIdentity.canonicalPath(projectPath)),
  refreshQualityReport: createQualityReportRefresher({ bundlePath: QUALITY_GUARD_BUNDLE }),
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve(text ? JSON.parse(text) : {}));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const launch = LAUNCH_PATH.test(url.pathname);
  try {
    if (url.pathname === "/api/admin/shutdown") {
      if (req.method !== "POST" || req.socket.remoteAddress?.replace("::ffff:", "") !== HOST || req.headers["x-openspec-dashboard-replacement-capability"] !== capabilities.replacement) {
        sendJson(res, 404, { error: "unknown route" });
        return;
      }
      // Finish this authenticated response before close waits for active sockets.
      acceptingLaunches = false;
      res.once("finish", () => void managedShutdown());
      sendJson(res, 200, { state: "closed" });
      return;
    }
    if (launch) assertLaunchRequest({ method: req.method, urlPath: url.pathname, headers: req.headers }, {
      capability: capabilities.browser,
      host: `${HOST}:${port}`,
      origin: `http://${HOST}:${port}`,
    });
    const body = launch ? await readLaunchBody(req) : req.method === "POST" ? await readBody(req) : {};
    sendJson(res, 200, await handle(req.method, url.pathname, url.searchParams, body));
  } catch (err) {
    sendJson(res, err.status ?? 500, launch ? launchFailure(err) : { error: err.message });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith("/api/")) {
    void handleApi(req, res, url);
    return;
  }
  void serveStatic(PUBLIC_DIR, url.pathname, res);
});

let ownership;
let shutdownPromise;

function managedShutdown() {
  if (shutdownPromise) return shutdownPromise;
  acceptingLaunches = false;
  shutdownPromise = children.shutdown().then(
    () =>
      new Promise((resolve) => {
        server.close(() => {
          ownership?.release();
          resolve();
        });
      }),
  );
  return shutdownPromise;
}

let port = FIRST_PORT;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE" || port >= FIRST_PORT + PORT_ATTEMPTS) throw err;
  port += 1;
  server.listen(port, HOST);
});
server.on("listening", () => {
  void (async () => {
    ownership = createDashboardOwnership();
    try {
      await ownership.claim({
        pid: process.pid,
        control_url: `http://${HOST}:${port}/api/admin/shutdown`,
        replacement_capability: capabilities.replacement,
      });
      acceptingLaunches = true;
      process.stdout.write(`Quality dashboard on http://${HOST}:${port}/#${capabilities.browser}\n`);
    } catch {
      server.close(() => process.exit(1));
    }
  })();
});
server.listen(port, HOST);
process.once("SIGINT", () => void managedShutdown());
process.once("SIGTERM", () => void managedShutdown());
