import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";
import { requestAuthenticatedShutdown } from "../lib/dashboard-ownership.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

test("starts from the normal launcher and refreshes the displayed quality report", async () => {
  const root = await mkdtemp(join(tmpdir(), "quality-dashboard-live-"));
  const dashboardHome = join(root, "dashboard-home");
  const project = join(root, "project");
  let child;
  let browser;
  try {
    await mkdir(join(project, "src", "nested"), { recursive: true });
    await mkdir(join(project, ".quality"), { recursive: true });
    await writeFile(join(project, "src", "quality-fixture.js"), "export function qualityFixture() { return 1; }\n");
    await writeFile(join(project, "src", "clean.js"), "const result = 1; console.log(result);\n");
    await writeFile(join(project, "src", "nested", "nested-fixture.js"), "const result = 1; console.log(result);\n");
    await writeFile(join(project, ".quality", "quality-report.json"), JSON.stringify(staleReport()));
    await mkdir(dashboardHome, { recursive: true });
    await writeFile(join(dashboardHome, "projects.json"), JSON.stringify({
      roots: [],
      projects: [{ name: "live-quality", path: project.replaceAll("\\", "/") }],
    }));

    const launcherScript = await readFile(join(repositoryRoot, "quality-dashboard.cmd"), "utf8");
    assert.match(launcherScript, /node tools\\openspec-dashboard\\serve\.mjs/u);
    child = spawnLauncher({ dashboardHome, port: await freePort() });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const dashboardUrl = await waitForDashboard(child, () => stdout, () => stderr);
    const dashboardOrigin = dashboardUrl.split("#", 1)[0];
    browser = await chromium.launch({ headless: true });
    const dashboard = await browser.newPage();
    await dashboard.goto(dashboardUrl);
    await dashboard.getByRole("button", { name: "live-quality", exact: true }).waitFor();
    await dashboard.locator(".finding strong", { hasText: "stale-rule" }).waitFor();

    const refresh = dashboard.getByRole("button", { name: "Refresh", exact: true });
    await refresh.click();
    await dashboard.locator(".finding strong", { hasText: "dead-export" }).waitFor();

    const saved = JSON.parse(await readFile(join(project, ".quality", "quality-report.json"), "utf8"));
    assert.equal(saved.schemaVersion, 1);
    assert.notEqual(saved.files[0]?.path, "stale/old.js");
    assert.equal(await dashboard.locator(".finding strong", { hasText: "stale-rule" }).count(), 0);
    assert.deepEqual(await dashboard.locator(".metric-value").allTextContents(), [
      Number(saved.summaries.overall.averageScore).toFixed(1),
      String(saved.summaries.overall.fileCount),
      String(saved.summaries.overall.errors),
      String(saved.summaries.overall.warnings),
    ]);
    assert.deepEqual(
      (await dashboard.locator(".quality-file > summary code").allTextContents()).sort(),
      saved.files.map((file) => file.path.split(/[\\/]/).at(-1)).sort(),
    );
    assert.deepEqual(
      await dashboard.locator(".quality-file > summary").evaluateAll((summaries) => summaries.map((summary) => ({
        name: summary.querySelector("code")?.textContent,
        note: summary.querySelector(".entry-note")?.textContent,
      }))),
      saved.files.map((file) => ({ name: file.path.split(/[\\/]/).at(-1), note: summaryText(fileSummary(file)) })),
    );
    assert.deepEqual(
      await dashboard.locator(".quality-folder > .quality-summary").evaluateAll((summaries) => summaries.map((summary) => ({
        name: summary.querySelector("strong")?.textContent,
        note: summary.querySelector(".entry-note")?.textContent,
      }))),
      folderSummaries(saved.files),
    );
    assert.deepEqual(
      await dashboard.locator(".finding").evaluateAll((rows) => rows.map((row) => ({
        rule: row.querySelector("strong")?.textContent,
        location: row.querySelector("code")?.textContent,
        message: row.querySelector("span")?.textContent,
        severity: row.classList.contains("error") ? "error" : "warn",
      }))),
      saved.files.flatMap((file) => file.findings.map((finding) => ({
        rule: finding.rule ?? finding.kind ?? "finding",
        location: finding.line ? `:${finding.line}` : "",
        message: finding.message ?? finding.reason ?? "",
        severity: finding.severity ?? "warn",
      }))),
    );

    const filter = dashboard.locator("#filter");
    await filter.fill("quality-fixture");
    await dashboard.locator(".quality-file > summary code", { hasText: "quality-fixture.js" }).waitFor();
    await dashboard.locator(".quality-file > summary code", { hasText: "clean.js" }).waitFor({ state: "detached" });
    assert.equal(await dashboard.locator(".quality-file").count(), 1);
    await filter.fill("");
    await dashboard.locator(".quality-file > summary code", { hasText: "clean.js" }).waitFor();
    const controls = dashboard.locator(".quality-control select");
    await controls.nth(0).selectOption("error");
    assert.equal(await dashboard.locator(".finding").count(), saved.summaries.overall.errors);
    await controls.nth(0).selectOption("all");
    await controls.nth(1).selectOption("dead-export");
    assert.equal(
      await dashboard.locator(".finding").count(),
      saved.files.flatMap((file) => file.findings).filter((finding) => (finding.rule ?? finding.kind ?? "finding") === "dead-export").length,
    );
    await controls.nth(1).selectOption("all");
    assert.equal(await dashboard.locator(".quality-file").count(), saved.files.length);
    const directFiles = dashboard.locator(".quality-folder").first().locator(":scope > .quality-children > .quality-file");
    const directReports = saved.files.filter((file) => file.path.split(/[\\/]/).length === 2);
    for (const sort of ["score", "errors", "warnings", "path"]) {
      await controls.nth(2).selectOption(sort);
      assert.deepEqual(
        await directFiles.locator("> summary code").allTextContents(),
        sortedFiles(directReports, sort).map((file) => file.path.split(/[\\/]/).at(-1)),
      );
    }
    const folder = dashboard.locator(".quality-folder").first();
    await dashboard.getByRole("button", { name: "Collapse all", exact: true }).click();
    assert.equal(await folder.getAttribute("open"), null);
    await dashboard.getByRole("button", { name: "Expand all", exact: true }).click();
    assert.notEqual(await folder.getAttribute("open"), null);
    await folder.locator(":scope > summary").click();
    assert.equal(await folder.getAttribute("open"), null);
    await folder.locator(":scope > summary").click();

    await dashboard.setViewportSize({ width: 390, height: 844 });
    const dimensions = await dashboard.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(dimensions.scrollWidth, dimensions.clientWidth);
    const layout = await dashboard.evaluate(() => [...document.querySelectorAll(
      "#refresh, #filter, .quality-controls, .quality-controls select, .quality-report, .quality-file, .quality-file > summary, .finding",
    )].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    }));
    assert.ok(layout.length > 0);
    for (const box of layout) {
      assert.ok(box.left >= 0 && box.right <= 390, "dashboard content is clipped at 390px");
      assert.ok(box.scrollWidth <= box.clientWidth, "dashboard content overflows inside its container at 390px");
    }
  } finally {
    await browser?.close().catch(() => undefined);
    try {
      if (child) await stopLauncher(child, dashboardHome);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

function staleReport() {
  return {
    schemaVersion: 1,
    summaries: {
      overall: { fileCount: 1, errors: 1, warnings: 0, averageScore: 95 },
      production: { fileCount: 1, errors: 1, warnings: 0, averageScore: 95 },
      test: { fileCount: 0, errors: 0, warnings: 0, averageScore: null },
    },
    files: [{
      path: "stale/old.js",
      language: "ts",
      classification: "production",
      score: 95,
      errors: 1,
      warnings: 0,
      findings: [{ rule: "stale-rule", severity: "error", line: 1, message: "stale report" }],
    }],
    architecture: {},
  };
}

function summaryText(summary) {
  const fileLabel = summary.fileCount === 1 ? "file" : "files";
  return `${summary.fileCount} ${fileLabel} | score ${Number(summary.averageScore).toFixed(1)} | ${summary.errors} errors | ${summary.warnings} warnings`;
}

function fileSummary(file) {
  return { fileCount: 1, averageScore: file.score, errors: file.errors, warnings: file.warnings };
}

function folderSummaries(files) {
  const folders = new Map();
  for (const file of files) {
    const parts = file.path.split(/[\\/]/);
    for (let index = 0; index < parts.length - 1; index += 1) {
      const path = parts.slice(0, index + 1).join("/");
      const folder = folders.get(path) ?? { name: parts[index], files: [] };
      folder.files.push(file);
      folders.set(path, folder);
    }
  }
  return [...folders.values()].map((folder) => ({
    name: folder.name,
    note: summaryText(summarizeFiles(folder.files)),
  }));
}

function summarizeFiles(files) {
  return {
    fileCount: files.length,
    averageScore: files.reduce((total, file) => total + Number(file.score ?? 0), 0) / files.length,
    errors: files.reduce((total, file) => total + Number(file.errors ?? 0), 0),
    warnings: files.reduce((total, file) => total + Number(file.warnings ?? 0), 0),
  };
}

function sortedFiles(files, sort) {
  return [...files].sort((left, right) => {
    if (sort === "score") return left.score - right.score || left.path.localeCompare(right.path);
    if (sort === "errors") return right.errors - left.errors || left.path.localeCompare(right.path);
    if (sort === "warnings") return right.warnings - left.warnings || left.path.localeCompare(right.path);
    return left.path.localeCompare(right.path);
  });
}

function spawnLauncher({ dashboardHome, port }) {
  const serve = join(repositoryRoot, "tools", "openspec-dashboard", "serve.mjs");
  const windows = process.platform === "win32";
  return spawn(
    windows ? "cmd.exe" : process.execPath,
    windows ? ["/d", "/s", "/c", "quality-dashboard.cmd"] : [serve],
    {
      env: {
        ...process.env,
        CODE_EXPLORER_JS: join(dashboardHome, "missing-code-explorer.js"),
        HOME: dashboardHome,
        OPENSPEC_DASHBOARD_HOME: dashboardHome,
        OPENSPEC_DASHBOARD_PORT: String(port),
        USERPROFILE: dashboardHome,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
}

async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function stopLauncher(child, dashboardHome) {
  if (child.exitCode !== null) return;
  try {
    const owner = JSON.parse(await readFile(join(dashboardHome, ".openspec-dashboard", "dashboard-owner.json"), "utf8"));
    await requestAuthenticatedShutdown(owner);
  } catch {
    child.kill();
  }
  await waitForExit(child);
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    const onExit = () => finish();
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("dashboard did not exit after shutdown"));
    }, SHUTDOWN_TIMEOUT_MS);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function waitForDashboard(child, getStdout, getStderr) {
  const pattern = /Quality dashboard on (http:\/\/127\.0\.0\.1:\d+\/#(?:[0-9a-f]{64}))/u;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(timeout);
      callback(value);
    };
    const check = () => {
      const match = pattern.exec(getStdout());
      if (match) finish(resolve, match[1]);
    };
    const timer = setInterval(check, 25);
    const fail = (error) => finish(reject, error);
    timeout = setTimeout(() => fail(new Error(`dashboard did not start within ${STARTUP_TIMEOUT_MS}ms`)), STARTUP_TIMEOUT_MS);
    child.once("error", fail);
    child.once("exit", (code, signal) => fail(new Error(`dashboard exited before startup: ${code ?? signal}\n${getStderr()}`)));
    check();
  });
}
