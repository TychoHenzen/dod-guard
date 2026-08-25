/**
 * `dod-guard complete <change-id> <task-id>` - the completion gate.
 *
 * The only path to marking a task done. Runs verify_cmd, checks for stubs,
 * and optionally asks an ollama model whether the test aligns with its
 * claimed scenario. Writes the status change to disk only when every
 * check passes.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CliIo } from "../cli.js";
import { enumerateAllScenarios, enumerateChangeScenarios } from "../cover/enumerate.js";
import { scanMarkers } from "../cover/markers.js";
import { parseTasksMarkdown, writeTaskStatus } from "../openspec/tasks-parser.js";
import { runShellCommand } from "../shell.js";
import { checkClaimAlignment, getOllamaConfig } from "./ollama.js";
import { extractFullScenarioText } from "./scenario-text.js";
import { checkStub } from "./stub-check.js";

export const EXIT_OK = 0;
export const EXIT_REJECTED = 1;
export const EXIT_USAGE = 3;

interface CompleteOpts {
  cwd: string;
  changeId: string;
  taskId: string;
}

export async function runComplete(opts: CompleteOpts, io: CliIo): Promise<number> {
  const { cwd, changeId, taskId } = opts;

  const tasksPath = path.join(cwd, "openspec", "changes", changeId, "tasks.md");
  let content: string;
  try {
    content = await fs.readFile(tasksPath, "utf-8");
  } catch {
    io.writeErr(`ERROR: cannot read ${tasksPath}\n`);
    return EXIT_USAGE;
  }

  const tasks = parseTasksMarkdown(content);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    io.writeErr(`ERROR: task "${taskId}" not found in ${tasksPath}\n`);
    return EXIT_USAGE;
  }

  if (task.checked && task.status === "completed") {
    io.write(`task ${taskId}: already completed\n`);
    return EXIT_OK;
  }

  // Manual tasks pass without automated checks
  if (task.manualRequired) {
    return writeAndReport(tasksPath, content, taskId, io);
  }

  // 1. verify_cmd
  if (task.verifyCmd) {
    const result = await runShellCommand(task.verifyCmd, cwd);
    if (result.code !== 0) {
      io.writeErr(`REJECTED: verify_cmd failed (exit ${result.code})\n`);
      if (result.stderr) io.writeErr(result.stderr);
      return EXIT_REJECTED;
    }
  }

  // 2. Stub check + claim alignment (only when the task covers a scenario)
  if (task.coversId) {
    const stubAndClaim = await checkCoveredTask(cwd, changeId, task.coversId, io);
    if (stubAndClaim !== EXIT_OK) return stubAndClaim;
  }

  return writeAndReport(tasksPath, content, taskId, io);
}

async function checkCoveredTask(cwd: string, changeId: string, scenarioId: string, io: CliIo): Promise<number> {
  // Parse the scenario id to extract the group for marker scanning
  const colonPos = scenarioId.indexOf("::");
  if (colonPos === -1) return EXIT_OK;
  const groupCapability = scenarioId.slice(0, colonPos);
  const slashPos = groupCapability.indexOf("/");
  if (slashPos === -1) return EXIT_OK;
  const group = groupCapability.slice(0, slashPos);

  // Find the test marker binding for this scenario
  const markers = await scanMarkers(cwd, group);
  const binding = markers.get(scenarioId);
  if (!binding) {
    // No test marker found - the task claims coverage but no test binds it.
    // This is not a gate rejection (cover already reports unwired scenarios),
    // but there is nothing to stub-check or eval against.
    io.write(`task covers ${scenarioId} but no test marker binds it - skipping stub/eval checks\n`);
    return EXIT_OK;
  }

  // Stub check on the test body
  if (binding.testBody) {
    const stubResult = checkStub(binding.testBody);
    if (!stubResult.pass) {
      io.writeErr(`REJECTED: stub check failed for test "${binding.testName}" in ${binding.file}\n`);
      for (const reason of stubResult.reasons) {
        io.writeErr(`  - ${reason}\n`);
      }
      return EXIT_REJECTED;
    }
  }

  // Ollama claim-to-test alignment
  const ollamaConfig = getOllamaConfig();
  if (ollamaConfig && binding.testBody) {
    const scenarioText = await resolveScenarioText(cwd, changeId, scenarioId);
    if (scenarioText) {
      const result = await checkClaimAlignment(binding.testBody, scenarioText, ollamaConfig);
      if (!result.available) {
        io.write(`ollama unavailable (${result.reason}) - falling back to stub check only\n`);
      } else if (!result.aligned) {
        io.writeErr(`REJECTED: ollama says the test does not align with the scenario\n`);
        io.writeErr(`scenario: ${scenarioId}\n`);
        io.writeErr(`test: ${binding.testName} in ${binding.file}\n`);
        return EXIT_REJECTED;
      } else {
        io.write(`ollama: test aligns with scenario\n`);
      }
    }
  }

  return EXIT_OK;
}

async function resolveScenarioText(cwd: string, changeId: string, scenarioId: string): Promise<string | undefined> {
  // Try the change's own specs first, then the main tree
  const changeScenarios = await enumerateChangeScenarios(cwd, changeId);
  let scenario = changeScenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    const allScenarios = await enumerateAllScenarios(cwd);
    scenario = allScenarios.find((s) => s.id === scenarioId);
  }
  if (!scenario) return undefined;

  const specContent = await fs.readFile(scenario.specPath, "utf-8");
  return extractFullScenarioText(specContent, scenario.scenarioTitle);
}

async function writeAndReport(tasksPath: string, content: string, taskId: string, io: CliIo): Promise<number> {
  const updated = writeTaskStatus(content, taskId, { checked: true, status: "completed" });
  await fs.writeFile(tasksPath, updated, "utf-8");
  io.write(`task ${taskId}: marked complete\n`);
  return EXIT_OK;
}
