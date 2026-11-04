#!/usr/bin/env node
// Sounds a reminder every five minutes for up to two hours and records its own
// PID so a later turn, or a session that restarted, can stop it.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const PID_FILE = join(tmpdir(), "dod-guard-goal-stop.pid");
export const BEEPS = 24;
export const INTERVAL_SECONDS = 300;
// The reminder ends by itself after BEEPS intervals. A record older than that
// plus slack belongs to a finished run, and its PID may now be another process.
export const STALE_MS = (BEEPS * INTERVAL_SECONDS + 300) * 1000;

export function readRecord(pidFile) {
  let text;
  try {
    text = readFileSync(pidFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const record = JSON.parse(text);
    return Number.isInteger(record.pid) && Number.isFinite(record.startedAt) ? record : { unreadable: true };
  } catch {
    return { unreadable: true };
  }
}

export function stopRecorded({ pidFile = PID_FILE, now = Date.now(), kill = process.kill.bind(process) } = {}) {
  const record = readRecord(pidFile);
  if (record === null) return "none";
  rmSync(pidFile, { force: true });
  if (record.unreadable) return "unreadable";
  if (now - record.startedAt > STALE_MS) return "stale";
  try {
    kill(record.pid);
    return "stopped";
  } catch (error) {
    if (error.code === "ESRCH") return "gone";
    throw error;
  }
}

export function soundCommand(platform = process.platform) {
  if (platform === "win32") return ["powershell", ["-NoProfile", "-Command", "[console]::beep(880,400)"]];
  if (platform === "darwin") return ["afplay", ["/System/Library/Sounds/Ping.aiff"]];
  return ["paplay", ["/usr/share/sounds/freedesktop/stereo/bell.oga"]];
}

function realBeep() {
  const [command, args] = soundCommand();
  spawnSync(command, args, { stdio: "ignore" });
}

export async function startBeeping({
  pidFile = PID_FILE,
  pid = process.pid,
  now = Date.now,
  beep = realBeep,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  beeps = BEEPS,
  intervalSeconds = INTERVAL_SECONDS,
  kill,
} = {}) {
  stopRecorded({ pidFile, now: now(), kill });
  writeFileSync(pidFile, JSON.stringify({ pid, startedAt: now() }));
  try {
    for (let index = 0; index < beeps; index += 1) {
      beep();
      if (index < beeps - 1) await sleep(intervalSeconds * 1000);
    }
  } finally {
    const record = readRecord(pidFile);
    if (record && record.pid === pid) rmSync(pidFile, { force: true });
  }
}

export async function main(argv, print = console.log) {
  if (argv[0] === "start") {
    await startBeeping();
    return 0;
  }
  if (argv[0] === "stop") {
    print(`goal-stop reminder: ${stopRecorded()}`);
    return 0;
  }
  print("usage: node goal-stop-beep.mjs start | stop");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2));
}
