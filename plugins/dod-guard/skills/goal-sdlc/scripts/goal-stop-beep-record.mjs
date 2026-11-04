import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

const UNREADABLE = { unreadable: true };
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

// The record lives under the user's home directory, never the shared temp
// directory: another local user can pre-create or symlink a predictable name
// in a world-writable directory, but cannot write into this one.
export function defaultRecordFile(home = homedir()) {
  return join(home, ".dod-guard", "goal-stop.pid");
}

function assertPrivate(dir, stat, uid) {
  if (!stat.isDirectory()) throw new Error(`${dir} is not a directory`);
  if (uid === undefined) return;
  if (stat.uid !== uid) throw new Error(`${dir} is owned by another user`);
  if ((stat.mode & 0o022) !== 0) throw new Error(`${dir} is writable by other users`);
}

// Creates the directory with owner-only permissions and refuses one that a
// different user owns, that others can write, or that is a symlink.
export function ensurePrivateDir(dir, uid = process.getuid?.()) {
  mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  assertPrivate(dir, lstatSync(dir), uid);
}

// 'wx' fails when anything already sits at the path, including a symlink, so a
// pre-planted file is never followed or overwritten.
export function writeRecord(pidFile, record) {
  ensurePrivateDir(dirname(pidFile));
  writeFileSync(pidFile, JSON.stringify(record), { flag: "wx", mode: PRIVATE_FILE_MODE });
}

function parseRecord(text) {
  try {
    const record = JSON.parse(text);
    return Number.isInteger(record.pid) && Number.isFinite(record.startedAt) ? record : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

// Returns null when no record exists, {unreadable: true} for a damaged one.
export function readRecord(pidFile) {
  try {
    return parseRecord(readFileSync(pidFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
