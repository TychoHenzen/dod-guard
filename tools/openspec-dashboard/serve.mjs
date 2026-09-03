#!/usr/bin/env node
// serve.mjs - start the OpenSpec dashboard on the loopback interface.
//
// Usage: node tools/openspec-dashboard/serve.mjs
//
// Environment:
//   OPENSPEC_JS               path to the OpenSpec CLI entry file
//   OPENSPEC_DASHBOARD_PORT   preferred port, default 4400

import { createServer } from "node:http";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./lib/api.mjs";
import { assertLaunchRequest, createCapabilities, LAUNCH_PATH, readLaunchBody } from "./lib/launch-http.mjs";
import { createCache } from "./lib/cache.mjs";
import { createReader, locateCli } from "./lib/cli.mjs";
import { createStore } from "./lib/registry.mjs";
import { serveStatic } from "./lib/static.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dir, "public");
const PID_FILE = join(__dir, ".dashboard.pid");

function killPrior() {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf-8").trim());
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {}
  try {
    unlinkSync(PID_FILE);
  } catch {}
}

killPrior();
writeFileSync(PID_FILE, String(process.pid));
process.on("exit", () => {
  try { unlinkSync(PID_FILE); } catch {}
});
const HOST = "127.0.0.1";
const capabilities = createCapabilities();
const FIRST_PORT = Number(process.env.OPENSPEC_DASHBOARD_PORT ?? 4400);
const PORT_ATTEMPTS = 20;

const entry = locateCli();
if (!entry) {
  process.stderr.write("Cannot find the OpenSpec CLI. Set OPENSPEC_JS to its bin/openspec.js.\n");
  process.exit(1);
}

const handle = createApi({ read: createReader(entry), cache: createCache(), store: createStore() });

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
  try {
    const launch = LAUNCH_PATH.test(url.pathname);
    if (launch) assertLaunchRequest({ method: req.method, urlPath: url.pathname, headers: req.headers }, {
      capability: capabilities.browser,
      host: `${HOST}:${port}`,
      origin: `http://${HOST}:${port}`,
    });
    const body = launch ? await readLaunchBody(req) : req.method === "POST" ? await readBody(req) : {};
    sendJson(res, 200, await handle(req.method, url.pathname, url.searchParams, body));
  } catch (err) {
    sendJson(res, err.status ?? 500, { error: err.message });
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

let port = FIRST_PORT;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE" || port >= FIRST_PORT + PORT_ATTEMPTS) throw err;
  port += 1;
  server.listen(port, HOST);
});
server.on("listening", () => {
  process.stdout.write(`OpenSpec dashboard on http://${HOST}:${port}/#${capabilities.browser}\nCLI: ${entry}\n`);
});
server.listen(port, HOST);
