import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { baseEvidence, loadPrerequisite, packageRoot, practiceTimeoutMs, PracticeFailure, writeEvidence } from "./practice-browser-config.mjs";
import { createSession, waitForBackend } from "./practice-browser-session.mjs";
import { navigate } from "./practice-browser-navigation.mjs";
import { reconcile } from "./practice-browser-reconciliation.mjs";
import { createPracticeWorkspace, preparePracticeWorkspace } from "./practice-browser-workspace.mjs";
import { stopChild, waitForEndpoint } from "./practice-browser-transport.mjs";

export async function practice(language) {
  const { backend, oracle } = await loadPrerequisite(language);
  const evidence = baseEvidence(language, backend);
  const { workspace, fixture, root } = await createPracticeWorkspace(language);
  const started = Date.now();
  let browser;
  let child;
  const timeout = setTimeout(() => child?.kill(), practiceTimeoutMs);
  try {
    await preparePracticeWorkspace(language, fixture, root);
    child = spawn(process.execPath, [join(packageRoot, "dist", "bundle.js"), "serve", "--project-root", root, "--no-open"], { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const endpoint = await waitForEndpoint(child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(endpoint);
    const { tab, session, state } = await createSession(page, endpoint);
    evidence.operation_states.session = state;
    const startGeneration = await waitForBackend({ page, endpoint, session, tab, language, evidence });
    const navigation = await navigate({ page, endpoint, session, tab, oracle, evidence });
    await reconcile({ page, endpoint, session, tab, root, oracle, evidence, startGeneration, ...navigation });
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
