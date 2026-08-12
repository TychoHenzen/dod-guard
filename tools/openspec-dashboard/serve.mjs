#!/usr/bin/env node
// serve.mjs - start the OpenSpec dashboard on the loopback interface.
//
// Usage: node tools/openspec-dashboard/serve.mjs
//
// Environment:
//   OPENSPEC_JS               path to the OpenSpec CLI entry file
//   OPENSPEC_DASHBOARD_PORT   preferred port, default 4400

import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./lib/api.mjs";
import { createCache } from "./lib/cache.mjs";
import { createReader, locateCli } from "./lib/cli.mjs";
import { createStore } from "./lib/registry.mjs";
import { serveStatic } from "./lib/static.mjs";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const HOST = "127.0.0.1";
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
    const body = req.method === "POST" ? await readBody(req) : {};
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
  serveStatic(PUBLIC_DIR, url.pathname, res);
});

let port = FIRST_PORT;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE" || port >= FIRST_PORT + PORT_ATTEMPTS) throw err;
  port += 1;
  server.listen(port, HOST);
});
server.on("listening", () => {
  process.stdout.write(`OpenSpec dashboard on http://${HOST}:${port}\nCLI: ${entry}\n`);
});
server.listen(port, HOST);
