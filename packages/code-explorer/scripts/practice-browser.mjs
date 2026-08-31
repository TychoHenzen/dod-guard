import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const languages = ["rust", "python", "csharp"];
const timeoutMs = 35_000;

function selectedLanguages(argv) {
  const index = argv.indexOf("--language");
  if (index < 0) return languages;
  const language = argv[index + 1];
  if (!languages.includes(language)) throw new Error("invalid_language");
  return [language];
}

function waitForEndpoint(child) {
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("practice_start_timeout")), timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = /Code Explorer: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolvePromise(match[1].slice(0, -1));
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`practice_server_exit_${code}`)));
  });
}

async function call(page, endpoint, session, tab, route, body) {
  return page.evaluate(async ({ endpoint, session, tab, route, body }) => {
    const response = await fetch(`${endpoint}${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-code-explorer-session": session,
        "x-code-explorer-tab": tab,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json() };
  }, { endpoint, session, tab, route, body });
}

async function practice(language) {
  const workspace = await mkdtemp(join(tmpdir(), `code-explorer-browser-${language}-`));
  const fixture = join(packageRoot, "fixtures", language);
  const root = join(workspace, "project");
  const started = Date.now();
  let browser;
  let child;
  try {
    await cp(fixture, root, { recursive: true });
    if (language === "rust") await writeFile(join(root, "Cargo.toml"), "[package]\nname = \"practice\"\nversion = \"0.1.0\"\nedition = \"2021\"\n");
    if (language === "python") await writeFile(join(root, "pyrightconfig.json"), "{\"include\":[\"src\"]}\n");
    if (language === "csharp") await writeFile(join(root, "Practice.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>\n");
    child = spawn(process.execPath, [join(packageRoot, "dist", "bundle.js"), "serve", "--project-root", root, "--no-open"], {
      cwd: packageRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const endpoint = await waitForEndpoint(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(endpoint);
    const tab = randomUUID();
    const created = await page.evaluate(async ({ endpoint, tab }) => {
      const response = await fetch(`${endpoint}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-code-explorer-tab": tab },
        body: JSON.stringify({ action: "create", tab_instance_id: tab, document_start: "new" }),
      });
      return { status: response.status, payload: await response.json() };
    }, { endpoint, tab });
    if (created.status !== 200 || typeof created.payload.data?.browser_session_id !== "string")
      throw new Error(`practice_session_failed_${created.status}_${created.payload.code ?? created.payload.state ?? "unknown"}`);
    const session = created.payload.data.browser_session_id;
    const status = await call(page, endpoint, session, tab, "/api/status", { action: "status" });
    let search = await call(page, endpoint, session, tab, "/api/search", { request_id: randomUUID(), query: "helper" });
    let candidate = search.payload.data?.candidates?.[0];
    while (!candidate && Date.now() - started < timeoutMs) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
      search = await call(page, endpoint, session, tab, "/api/search", { request_id: randomUUID(), query: "helper" });
      candidate = search.payload.data?.candidates?.[0];
    }
    if (search.status !== 200 || !candidate?.identity)
      throw new Error(`practice_search_failed_${search.payload.code ?? "empty"}_${JSON.stringify(status.payload)}`);
    const focus = await call(page, endpoint, session, tab, "/api/focus", { request_id: randomUUID(), symbol_id: candidate.identity });
    if (focus.status !== 200 || !focus.payload.data?.view_id) throw new Error(`practice_focus_failed_${focus.payload.code ?? "unknown"}`);
    const handle = focus.payload.data.handles?.[0];
    const follow = handle
      ? await call(page, endpoint, session, tab, "/api/follow", { request_id: randomUUID(), view_id: focus.payload.data.view_id, handle: handle.handle, relation: "definition" })
      : { status: 200, payload: { state: "unavailable_relation" } };
    const back = await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "back" });
    const forward = await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "forward" });
    await rename(join(root, "src"), join(root, "src-saved"));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    const stale = await call(page, endpoint, session, tab, "/api/status", { action: "status" });
    const refocus = await call(page, endpoint, session, tab, "/api/focus", { request_id: randomUUID(), symbol_id: candidate.identity });
    const refresh = await call(page, endpoint, session, tab, "/api/status", { action: "refresh", request_id: randomUUID() });
    return {
      language,
      backend: created.payload.state,
      operations: { search: search.payload.state, focus: focus.payload.state, follow: follow.payload.state, back: back.payload.state, forward: forward.payload.state, stale: stale.payload.state, refocus: refocus.payload.state, refresh: refresh.payload.state },
      elapsed_ms: Date.now() - started,
    };
  } finally {
    await browser?.close();
    child?.kill();
    await rm(workspace, { recursive: true, force: true });
  }
}

try {
  const records = [];
  for (const language of selectedLanguages(process.argv.slice(2))) records.push(await practice(language));
  process.stdout.write(`${JSON.stringify({ schema_version: 1, records })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "practice_failed"}\n`);
  process.exitCode = 4;
}
