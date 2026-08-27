import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CliIo } from "../cli.js";
import { guardExists, snapshotTasks } from "../complete/task-guard.js";
import { parseTasksMarkdown } from "../openspec/tasks-parser.js";

export const EXIT_OK = 0;
export const EXIT_USAGE = 3;

interface LockOpts {
  cwd: string;
  changeId: string;
}

export async function runLock(opts: LockOpts, io: CliIo): Promise<number> {
  const tasksPath = path.join(opts.cwd, "openspec", "changes", opts.changeId, "tasks.md");

  let content: string;
  try {
    content = await fs.readFile(tasksPath, "utf-8");
  } catch {
    io.writeErr(`ERROR: ${tasksPath} not found.\n`);
    return EXIT_USAGE;
  }

  const tasks = parseTasksMarkdown(content);
  const wasLocked = await guardExists(tasksPath);
  await snapshotTasks(tasksPath, tasks);

  const verb = wasLocked ? "re-locked" : "locked";
  io.write(`${verb} ${tasks.length} task(s) in ${opts.changeId}\n`);
  return EXIT_OK;
}
