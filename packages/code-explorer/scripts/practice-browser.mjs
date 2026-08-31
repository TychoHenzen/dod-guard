import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const languages = ["rust", "python", "csharp"];
const readinessTimeoutMs = 30_000;
const reconciliationTimeoutMs = 35_000;
const practiceTimeoutMs = 90_000;
const evidenceRoot = join(packageRoot, "practice", "evidence");

class PracticeFailure extends Error {
  constructor(code, exitCode = 1) {
    super(code);
    this.exitCode = exitCode;
  }
}

function selectedLanguages(argv) {
  if (argv.length === 0) return languages;
  if (argv.length !== 2 || argv[0] !== "--language" || !languages.includes(argv[1]))
    throw new PracticeFailure("invalid_cli_usage", 2);
  return [argv[1]];
}

async function loadPrerequisite(language) {
  let selection;
  let oracle;
  try {
    selection = JSON.parse(await readFile(join(packageRoot, "adapter-selection.json"), "utf8"));
    oracle = JSON.parse(await readFile(join(packageRoot, "fixtures", language, "semantic-oracle.json"), "utf8"));
  } catch {
    throw new PracticeFailure("practice_prerequisite_failed");
  }
  const backend = selection?.runtime_backends?.find((candidate) => candidate.language === language);
  if (
    selection?.schema_version !== 1 ||
    oracle?.schema_version !== 1 ||
    oracle?.language !== language ||
    !backend?.compatible_version ||
    selection?.selected_paths?.[language] !== "direct_standard_public_lsp"
  )
    throw new PracticeFailure("practice_prerequisite_failed");
  return { backend, oracle };
}

function waitForEndpoint(child) {
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
      const match = /(?:^|\r?\n)Code Explorer: (http:\/\/127\.0\.0\.1:\d+\/)\r?(?:\n|$)/.exec(output);
      if (match) finish(() => resolvePromise(match[1].slice(0, -1)));
    };
    const onError = () => finish(() => reject(new PracticeFailure("practice_start_failed")));
    const onExit = () => finish(() => reject(new PracticeFailure("practice_start_failed")));
    const timer = setTimeout(
      () => finish(() => reject(new PracticeFailure("practice_start_failed"))),
      readinessTimeoutMs,
    );
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function call(page, endpoint, session, tab, route, body) {
  return page.evaluate(
    async ({ endpoint: url, session: sessionId, tab: tabId, route: path, body: requestBody }) => {
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

function expectSuccess(result, operation) {
  if (result.status !== 200 || result.payload?.code) throw new PracticeFailure(`practice_${operation}_failed`);
  return result.payload;
}

function sameLocation(actual, expected, path) {
  return (
    actual?.path === path &&
    actual?.range?.start?.line === expected?.start?.line &&
    actual?.range?.start?.character === expected?.start?.character &&
    actual?.range?.end?.line === expected?.end?.line &&
    actual?.range?.end?.character === expected?.end?.character
  );
}

async function waitForGeneration(page, endpoint, session, tab, startGeneration) {
  const deadline = Date.now() + reconciliationTimeoutMs;
  while (Date.now() <= deadline) {
    const status = expectSuccess(await call(page, endpoint, session, tab, "/api/status", { action: "status" }), "status");
    const generation = status.data?.current_generation;
    if (Number.isInteger(generation) && generation > startGeneration) return status;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new PracticeFailure("practice_reconciliation_timeout");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000))]);
  if (child.exitCode === null) child.kill();
}

function baseEvidence(language, backend) {
  return {
    schema_version: 1,
    language,
    backend: {
      name: backend.platform_executables[process.platform === "win32" ? "win32" : "posix"],
      version: backend.compatible_version,
    },
    operation_states: {},
    expected_locations: {},
    actual_locations: {},
    generations: { start: null, final: null },
    elapsed_ms: 0,
    error_code: null,
  };
}

async function writeEvidence(record) {
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, `${record.language}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

async function practice(language) {
  const { backend, oracle } = await loadPrerequisite(language);
  const evidence = baseEvidence(language, backend);
  const workspace = await mkdtemp(join(tmpdir(), `code-explorer-browser-${language}-`));
  const fixture = join(packageRoot, "fixtures", language);
  const root = join(workspace, "project");
  const started = Date.now();
  let browser;
  let child;
  const timeout = setTimeout(() => child?.kill(), practiceTimeoutMs);
  try {
    await cp(fixture, root, { recursive: true });
    if (language === "rust")
      await writeFile(join(root, "Cargo.toml"), "[package]\nname = \"practice\"\nversion = \"0.1.0\"\nedition = \"2021\"\n");
    if (language === "python") await writeFile(join(root, "pyrightconfig.json"), "{\"include\":[\"src\"]}\n");
    if (language === "csharp")
      await writeFile(
        join(root, "Practice.csproj"),
        "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>\n",
      );
    child = spawn(
      process.execPath,
      [join(packageRoot, "dist", "bundle.js"), "serve", "--project-root", root, "--no-open"],
      { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const endpoint = await waitForEndpoint(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(endpoint);
    const tab = randomUUID();
    const created = await page.evaluate(
      async ({ endpoint: url, tab: tabId }) => {
        const response = await fetch(`${url}/api/session`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-code-explorer-tab": tabId },
          body: JSON.stringify({ action: "create", tab_instance_id: tabId, document_start: "new" }),
        });
        return { status: response.status, payload: await response.json() };
      },
      { endpoint, tab },
    );
    const createdPayload = expectSuccess(created, "session");
    const session = createdPayload.data?.browser_session_id;
    if (typeof session !== "string") throw new PracticeFailure("practice_session_failed");
    evidence.operation_states.session = createdPayload.state;

    let status;
    let selectedBackend;
    const readyDeadline = Date.now() + readinessTimeoutMs;
    do {
      status = expectSuccess(await call(page, endpoint, session, tab, "/api/status", { action: "status" }), "status");
      selectedBackend = status.data?.backend_status?.backends?.find((candidate) => candidate.language === language);
      if (["ready", "degraded"].includes(selectedBackend?.state)) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    } while (Date.now() <= readyDeadline);
    if (
      !selectedBackend ||
      !["ready", "degraded"].includes(selectedBackend.state) ||
      selectedBackend.backend_name !== evidence.backend.name ||
      selectedBackend.backend_version !== evidence.backend.version
    )
      throw new PracticeFailure("practice_prerequisite_failed");
    const startGeneration = status.data?.current_generation;
    if (!Number.isInteger(startGeneration)) throw new PracticeFailure("practice_generation_failed");
    evidence.generations.start = startGeneration;
    evidence.operation_states.status = status.state;

    let search;
    let candidate;
    const searchDeadline = Date.now() + readinessTimeoutMs;
    do {
      search = await call(page, endpoint, session, tab, "/api/search", {
        request_id: randomUUID(),
        query: oracle.symbols.helper.name,
      });
      candidate = search.payload?.data?.candidates?.find((item) => item.name === oracle.symbols.helper.name);
      if (search.status === 200 && candidate?.identity) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    } while (Date.now() <= searchDeadline);
    evidence.operation_states.search = search?.payload?.code ?? search?.payload?.state ?? "missing";
    const searchPayload = expectSuccess(search, "search");
    if (!candidate?.identity) throw new PracticeFailure("practice_search_failed");
    evidence.operation_states.search = searchPayload.state;

    const focusPayload = expectSuccess(
      await call(page, endpoint, session, tab, "/api/focus", {
        request_id: randomUUID(),
        symbol_id: candidate.identity,
      }),
      "focus",
    );
    const focus = focusPayload.data;
    const handle = focus?.handles?.find((item) => item.name === oracle.symbols.helper.name);
    if (!focus?.view_id || !handle?.handle) throw new PracticeFailure("practice_focus_failed");
    const expectedDefinition = { path: oracle.source_file, range: oracle.symbols.helper.declaration };
    const actualDefinition = { path: focus.path, range: focus.range };
    evidence.expected_locations.helper_definition = expectedDefinition;
    evidence.actual_locations.helper_definition = actualDefinition;
    if (!sameLocation(actualDefinition, oracle.symbols.helper.declaration, oracle.source_file))
      throw new PracticeFailure("practice_oracle_mismatch");
    evidence.operation_states.focus = focusPayload.state;

    const followPayload = expectSuccess(
      await call(page, endpoint, session, tab, "/api/follow", {
        request_id: randomUUID(),
        view_id: focus.view_id,
        handle: handle.handle,
        relation: "callers",
      }),
      "follow",
    );
    evidence.operation_states.follow = followPayload.state;
    const caller = followPayload.data?.candidates?.find((item) => item.external === false && item.call_site);
    if (!caller) throw new PracticeFailure("practice_follow_failed");
    const expectedCallSite = { path: oracle.source_file, range: oracle.relations.callers.callers[0].call_site };
    const actualCallSite = caller.call_site;
    evidence.expected_locations.helper_call_site = expectedCallSite;
    evidence.actual_locations.helper_call_site = actualCallSite;
    if (!sameLocation(actualCallSite, oracle.relations.callers.callers[0].call_site, oracle.source_file))
      throw new PracticeFailure("practice_oracle_mismatch");

    const backPayload = expectSuccess(
      await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "back" }),
      "back",
    );
    const forwardPayload = expectSuccess(
      await call(page, endpoint, session, tab, "/api/history", { request_id: randomUUID(), action: "forward" }),
      "forward",
    );
    if (backPayload.data?.view_id !== focus.view_id || forwardPayload.data?.view_id !== caller.view_id)
      throw new PracticeFailure("practice_history_failed");
    evidence.operation_states.back = backPayload.state;
    evidence.operation_states.forward = forwardPayload.state;

    const sourcePath = join(root, ...oracle.source_file.split("/"));
    const original = await readFile(sourcePath, "utf8");
    const changed = original.replaceAll(oracle.symbols.helper.name, `${oracle.symbols.helper.name}Saved`);
    if (changed === original) throw new PracticeFailure("practice_saved_file_failed");
    await writeFile(sourcePath, changed, "utf8");
    evidence.operation_states.saved_file = "written";
    const reconciled = await waitForGeneration(page, endpoint, session, tab, startGeneration);
    evidence.generations.final = reconciled.data.current_generation;
    evidence.operation_states.reconciliation = reconciled.state;

    const stale = await call(page, endpoint, session, tab, "/api/follow", {
      request_id: randomUUID(),
      view_id: focus.view_id,
      handle: handle.handle,
      relation: "callers",
    });
    if (stale.payload?.code !== "stale_view") throw new PracticeFailure("practice_stale_failed");
    evidence.operation_states.stale = stale.payload.code;

    const refocus = await call(page, endpoint, session, tab, "/api/focus", {
      request_id: randomUUID(),
      symbol_id: candidate.identity,
    });
    if (refocus.status === 200 && !refocus.payload?.code) evidence.operation_states.refocus = refocus.payload.state;
    else if (refocus.payload?.code === "backend_unavailable") evidence.operation_states.refocus = refocus.payload.code;
    else throw new PracticeFailure("practice_refocus_failed");
    const refreshPayload = expectSuccess(
      await call(page, endpoint, session, tab, "/api/status", { action: "refresh", request_id: randomUUID() }),
      "refresh",
    );
    evidence.operation_states.refresh = refreshPayload.state;
    evidence.generations.final = refreshPayload.data?.current_generation ?? refreshPayload.project_generation;
    evidence.elapsed_ms = Date.now() - started;
    await writeEvidence(evidence);
    return evidence;
  } catch (error) {
    evidence.elapsed_ms = Date.now() - started;
    evidence.error_code = error instanceof PracticeFailure ? error.message : "practice_failed";
    await writeEvidence(evidence);
    throw error;
  } finally {
    clearTimeout(timeout);
    await browser?.close();
    await stopChild(child);
    await rm(workspace, { recursive: true, force: true });
  }
}

try {
  const records = [];
  for (const language of selectedLanguages(process.argv.slice(2))) records.push(await practice(language));
  process.stdout.write(`${JSON.stringify({ schema_version: 1, records })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "practice_failed"}\n`);
  process.exitCode = error instanceof PracticeFailure ? error.exitCode : 1;
}
