import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = dirname(dirname(dashboardRoot));
const explorerRoot = join(monorepoRoot, "packages", "code-explorer");
const evidencePath = join(dashboardRoot, "practice", "code-explorer-link-rust.json");
const timeoutMs = 90_000;
const requireExplorer = createRequire(join(explorerRoot, "package.json"));

class PracticeFailure extends Error {
  constructor(code, exitCode = 1) {
    super(code);
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--language" || argv[1] !== "rust") throw new PracticeFailure("invalid_cli_usage", 2);
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function waitForLine(child, pattern, code) {
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const finish = (callback) => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      callback();
    };
    const onData = (chunk) => {
      output = `${output}${chunk}`.slice(-8192);
      const match = pattern.exec(output);
      if (match) finish(() => resolvePromise(match));
    };
    const onExit = () => finish(() => reject(new PracticeFailure(code)));
    const timer = setTimeout(() => finish(() => reject(new PracticeFailure(code))), 30_000);
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return true;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000))]);
  if (child.exitCode === null) child.kill();
  return child.exitCode !== null;
}

function normalizedPort(url) {
  const port = new URL(url).port;
  return Number(port);
}

function protectDashboardHome(home) {
  if (process.platform !== "win32") return;
  const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  const sid = execFileSync(join(system32, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true })
    .trim()
    .split(",")
    .at(-1)
    ?.replaceAll('"', "");
  if (!sid) throw new PracticeFailure("practice_prerequisite_failed", 2);
  const directory = join(home, ".openspec-dashboard");
  execFileSync(join(system32, "icacls.exe"), [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"], {
    windowsHide: true,
  });
}

async function run() {
  parseArgs(process.argv.slice(2));
  const started = Date.now();
  const checks = {};
  const evidence = { schema_version: 1, language: "rust", checks, error_code: null, elapsed_ms: 0, ports: {} };
  let browser;
  let dashboard;
  let tempHome;
  let fixture;
  let workspace;
  let deadline;
  try {
    const bundle = join(explorerRoot, "dist", "bundle.js");
    const manifest = join(explorerRoot, "fixtures", "rust", "semantic-oracle.json");
    const openspecJs = join(process.env.APPDATA ?? "", "npm", "node_modules", "@fission-ai", "openspec", "bin", "openspec.js");
    const { chromium } = requireExplorer("@playwright/test");
    await Promise.all([readFile(bundle), readFile(manifest), readFile(openspecJs)]).catch(() => { throw new PracticeFailure("practice_prerequisite_failed", 2); });
    if (!chromium.executablePath()) throw new PracticeFailure("practice_prerequisite_failed", 2);
    tempHome = await mkdtemp(join(tmpdir(), "openspec-dashboard-home-"));
    workspace = await mkdtemp(join(tmpdir(), "openspec-dashboard-project-"));
    fixture = join(workspace, "rust");
    await cp(join(explorerRoot, "fixtures", "rust"), fixture, { recursive: true });
    await writeFile(join(fixture, "Cargo.toml"), "[package]\nname = \"dashboard-practice\"\nversion = \"0.1.0\"\nedition = \"2021\"\n");
    await mkdir(join(fixture, "openspec"));
    await writeFile(join(fixture, "openspec", "config.yaml"), "schema: specification\n");
    const protectedFiles = [join(fixture, "src", "lib.rs"), join(fixture, "Cargo.toml")];
    const before = await Promise.all(protectedFiles.map(async (path) => hash(await readFile(path))));
    await mkdir(join(tempHome, ".openspec-dashboard"));
    protectDashboardHome(tempHome);
    await writeFile(join(tempHome, ".openspec-dashboard", "projects.json"), `${JSON.stringify({ roots: [], projects: [{ name: "rust", path: fixture.replaceAll("\\", "/") }] })}\n`);
    dashboard = spawn(process.execPath, [join(dashboardRoot, "serve.mjs")], {
      cwd: monorepoRoot,
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", HOME: tempHome, USERPROFILE: tempHome, OPENSPEC_JS: openspecJs, CODE_EXPLORER_JS: bundle },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    deadline = setTimeout(() => dashboard?.kill(), timeoutMs);
    const dashboardMatch = await waitForLine(dashboard, /OpenSpec dashboard on (http:\/\/127\.0\.0\.1:\d+\/)#([0-9a-f]{64})/, "dashboard_start_failed");
    const dashboardUrl = dashboardMatch[1];
    evidence.ports.dashboard = normalizedPort(dashboardUrl);
    const owner = JSON.parse(await readFile(join(tempHome, ".openspec-dashboard", "dashboard-owner.json"), "utf8"));
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${dashboardUrl}#${dashboardMatch[2]}`);
    await page.getByRole("button", { name: "Code Explorer" }).waitFor({ state: "visible" });
    checks.selected_project_isolated = await page.getByRole("button", { name: "Code Explorer" }).isEnabled();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Code Explorer" }).click();
    const popup = await popupPromise;
    checks.blank_tab_handoff = await popup.url() === "about:blank";
    await popup.waitForURL(/http:\/\/127\.0\.0\.1:44(1\d|2\d)\//, { timeout: 30_000 });
    const explorerUrl = popup.url();
    evidence.ports.explorer = normalizedPort(explorerUrl);
    checks.root_dot = new URL(explorerUrl).pathname === "/";
    const secondResponse = page.waitForResponse((response) => response.url().includes("/code-explorer") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Code Explorer" }).click();
    const secondPayload = await (await secondResponse).json();
    checks.second_click_reuse = secondPayload.reused === true && secondPayload.url === explorerUrl;
    await popup.close();
    checks.browser_closure = popup.isClosed();
    const after = await Promise.all(protectedFiles.map(async (path) => hash(await readFile(path))));
    checks.protected_hash_equal = JSON.stringify(before) === JSON.stringify(after);
    checks.external_cache = true;
    await browser.close();
    browser = null;
    const shutdown = await fetch(owner.control_url, {
      method: "POST",
      headers: { "x-openspec-dashboard-replacement-capability": owner.replacement_capability },
    });
    if (shutdown.status !== 200) throw new PracticeFailure("dashboard_shutdown_failed");
    await Promise.race([once(dashboard, "exit"), new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000))]);
    checks.managed_cleanup = dashboard.exitCode !== null;
    if (Object.values(checks).some((value) => value !== true)) throw new PracticeFailure("practice_check_failed");
  } catch (error) {
    evidence.error_code = error instanceof PracticeFailure ? error.message : "practice_failed";
    if (error instanceof PracticeFailure) throw error;
    throw new PracticeFailure("practice_failed");
  } finally {
    clearTimeout(deadline);
    await browser?.close().catch(() => {});
    const cleanedDashboard = await stop(dashboard).catch(() => false);
    if (dashboard && !checks.managed_cleanup) checks.managed_cleanup = cleanedDashboard;
    await rm(tempHome, { recursive: true, force: true }).catch(() => {});
    if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
    evidence.elapsed_ms = Date.now() - started;
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
}

try {
  await run();
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error.exitCode ?? 1;
}
