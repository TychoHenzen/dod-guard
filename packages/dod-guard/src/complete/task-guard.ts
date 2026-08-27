/**
 * Shadow guard for tasks.md. Keeps a hidden snapshot so unauthorized
 * checkbox edits can be detected and reverted.
 */
import { createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { TaskItem } from "../openspec/tasks-parser.js";
import { writeTaskStatus } from "../openspec/tasks-parser.js";

const GUARD_FILENAME = ".task-guard.json";
const GUARD_VERSION = 1;
// Not a secret - just enough that an LLM cannot guess the right HMAC
// to forge a shadow file without reading this source.
const HMAC_SALT = "dod-guard-tamper-detection-v1-9f3a7c2e";

interface TaskSnapshot {
  checked: boolean;
  status?: string;
}

interface GuardFile {
  v: number;
  tasks: Record<string, TaskSnapshot>;
  hmac: string;
}

export interface TamperedTask {
  taskId: string;
  field: "checked" | "status";
  shadowValue: boolean | string | undefined;
  diskValue: boolean | string | undefined;
}

export interface TamperResult {
  tampered: TamperedTask[];
  shadowMissing: boolean;
  shadowCorrupted: boolean;
}

function guardPath(tasksPath: string): string {
  return path.join(path.dirname(tasksPath), GUARD_FILENAME);
}

function computeHmac(tasksPath: string, tasks: Record<string, TaskSnapshot>): string {
  const payload = JSON.stringify(tasks, Object.keys(tasks).sort());
  return createHmac("sha256", HMAC_SALT + tasksPath)
    .update(payload)
    .digest("hex");
}

type GuardRead = { kind: "ok"; guard: GuardFile } | { kind: "missing" } | { kind: "corrupted" };

async function readGuard(tasksPath: string): Promise<GuardRead> {
  let raw: string;
  try {
    raw = await fs.readFile(guardPath(tasksPath), "utf-8");
  } catch {
    return { kind: "missing" };
  }
  try {
    const parsed = JSON.parse(raw) as GuardFile;
    if (parsed.v !== GUARD_VERSION) return { kind: "corrupted" };
    const expected = computeHmac(tasksPath, parsed.tasks);
    if (parsed.hmac !== expected) return { kind: "corrupted" };
    return { kind: "ok", guard: parsed };
  } catch {
    return { kind: "corrupted" };
  }
}

export async function snapshotTasks(tasksPath: string, tasks: TaskItem[]): Promise<void> {
  const snapshots: Record<string, TaskSnapshot> = {};
  for (const t of tasks) {
    const snap: TaskSnapshot = { checked: t.checked };
    if (t.status) snap.status = t.status;
    snapshots[t.id] = snap;
  }
  const guard: GuardFile = {
    v: GUARD_VERSION,
    tasks: snapshots,
    hmac: computeHmac(tasksPath, snapshots),
  };
  await fs.writeFile(guardPath(tasksPath), JSON.stringify(guard, null, 2), "utf-8");
}

export async function detectTampering(tasksPath: string, tasks: TaskItem[]): Promise<TamperResult> {
  const result = await readGuard(tasksPath);
  if (result.kind === "missing") return { tampered: [], shadowMissing: true, shadowCorrupted: false };
  if (result.kind === "corrupted") return { tampered: [], shadowMissing: false, shadowCorrupted: true };

  const tampered: TamperedTask[] = [];
  for (const task of tasks) {
    const shadow = result.guard.tasks[task.id];
    if (!shadow) continue;
    if (task.checked && !shadow.checked) {
      tampered.push({
        taskId: task.id,
        field: "checked",
        shadowValue: shadow.checked,
        diskValue: task.checked,
      });
    }
    if (task.status === "completed" && shadow.status !== "completed") {
      tampered.push({
        taskId: task.id,
        field: "status",
        shadowValue: shadow.status,
        diskValue: task.status,
      });
    }
  }
  return { tampered, shadowMissing: false, shadowCorrupted: false };
}

export function revertTampering(content: string, tampered: TamperedTask[]): string {
  let result = content;
  const seen = new Set<string>();
  for (const t of tampered) {
    if (seen.has(t.taskId)) continue;
    seen.add(t.taskId);
    result = writeTaskStatus(result, t.taskId, { checked: false, status: "reverted" });
  }
  return result;
}

export async function guardExists(tasksPath: string): Promise<boolean> {
  try {
    await fs.access(guardPath(tasksPath));
    return true;
  } catch {
    return false;
  }
}
