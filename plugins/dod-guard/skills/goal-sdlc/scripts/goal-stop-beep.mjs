#!/usr/bin/env node
// Sounds a reminder every five minutes for up to two hours and records its own
// PID so a later turn, or a session that restarted, can stop it.
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isBeepProcess, readCommandLine } from "./goal-stop-beep-identity.mjs";
import { readRecord } from "./goal-stop-beep-record.mjs";
import { playSound } from "./goal-stop-beep-sound.mjs";

export const PID_FILE = join(tmpdir(), "dod-guard-goal-stop.pid");
export const BEEPS = 24;
export const INTERVAL_SECONDS = 300;
// The reminder ends by itself after BEEPS intervals. A record older than that
// plus slack belongs to a finished run, and its PID may now be another process.
export const STALE_MS = (BEEPS * INTERVAL_SECONDS + 300) * 1000;

// The reason a record must not be killed, or null when its pid is the beep process.
function reasonToSpare(record, now, commandLineOf) {
  if (record.unreadable) return "unreadable";
  if (now - record.startedAt > STALE_MS) return "stale";
  return isBeepProcess(commandLineOf(record.pid)) ? null : "foreign";
}

function terminate(pid, kill) {
  try {
    kill(pid);
    return "stopped";
  } catch (error) {
    if (error.code === "ESRCH") return "gone";
    throw error;
  }
}

export function stopRecorded({
  pidFile = PID_FILE,
  now = Date.now(),
  kill = process.kill.bind(process),
  commandLineOf = readCommandLine,
} = {}) {
  const record = readRecord(pidFile);
  if (record === null) return "none";
  rmSync(pidFile, { force: true });
  return reasonToSpare(record, now, commandLineOf) ?? terminate(record.pid, kill);
}

export async function startBeeping({
  pidFile = PID_FILE,
  pid = process.pid,
  now = Date.now,
  beep = playSound,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  beeps = BEEPS,
  intervalSeconds = INTERVAL_SECONDS,
  kill,
  commandLineOf,
} = {}) {
  stopRecorded({ pidFile, now: now(), kill, commandLineOf });
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
