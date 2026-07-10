// Obsidian CLI wrapper — shell out to `obsidian` command.
// All CLI calls ensure the Obsidian app is running first.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VaultInfo } from "./types.js";

const execFileP = promisify(execFile);

const OBSIDIAN_CMD = "obsidian";

// ── App lifecycle ────────────────────────────────────────────────────────

export async function cliAvailable(): Promise<boolean> {
  try {
    await runObsidian(["version"], 5000);
    return true;
  } catch {
    return false;
  }
}

/** Ensure Obsidian app is running. If not, launch it and wait for ready. */
export async function ensureObsidianRunning(): Promise<void> {
  if (await cliAvailable()) return;

  // Launch the app (no args = launch GUI)
  try {
    execFile(OBSIDIAN_CMD).unref();
  } catch {
    // Already launching
  }

  // Wait for app to become responsive (up to 30s)
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await cliAvailable()) return;
  }
  throw new Error("Obsidian app did not start within 30s. Is it installed?");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Raw CLI ──────────────────────────────────────────────────────────────

async function runObsidian(
  args: string[],
  timeout = 15000,
): Promise<{ stdout: string; stderr: string }> {
  return execFileP(OBSIDIAN_CMD, args, { timeout, windowsHide: true });
}

/**
 * Call Obsidian CLI for a specific vault.
 * Prepends `vault=<vaultName>` when targeting a specific vault.
 */
async function obsidian(
  vaultName: string | null,
  args: string[],
  timeout = 15000,
): Promise<{ stdout: string; stderr: string }> {
  await ensureObsidianRunning();
  const fullArgs = vaultName ? [`vault=${vaultName}`, ...args] : args;
  return runObsidian(fullArgs, timeout);
}

// ── Vault listing ────────────────────────────────────────────────────────

export async function listVaults(): Promise<VaultInfo[]> {
  await ensureObsidianRunning();
  const { stdout } = await runObsidian(["vaults", "verbose"]);
  return parseVaultsOutput(stdout);
}

export async function getVaultInfo(vaultName: string): Promise<Partial<VaultInfo>> {
  const { stdout } = await obsidian(vaultName, ["vault"]);
  const m: Partial<VaultInfo> = {};
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length >= 2) {
      const key = parts[0].trim().toLowerCase();
      const val = parts[1].trim();
      if (key === "name") m.name = val;
      if (key === "path") m.path = val;
      if (key === "files") m.noteCount = parseInt(val) || 0;
      if (key === "folders") m.folderCount = parseInt(val) || 0;
      if (key === "size") m.size = val;
    }
  }
  return m;
}

// ── Note reading ─────────────────────────────────────────────────────────

/** Read raw markdown content of a note via CLI. */
export async function cliReadNote(
  vaultName: string,
  notePath: string,
): Promise<string> {
  const { stdout } = await obsidian(vaultName, ["read", `path=${notePath}`]);
  return stdout;
}

// ── File listing ─────────────────────────────────────────────────────────

/** List markdown files in a vault directory. Throws on CLI error output. */
export async function cliListFiles(
  vaultName: string,
  directory?: string,
): Promise<string[]> {
  const args = ["files", "ext=md"];
  if (directory) args.push(`folder=${directory}`);
  const { stdout } = await obsidian(vaultName, args);
  // CLI exits 0 even for unknown commands; detect error output
  if (stdout.trim().startsWith("Error:") || stdout.includes("Did you mean:")) {
    throw new Error(`obsidian CLI files failed: ${stdout.trim().split("\n")[0]}`);
  }
  return stdout.split("\n").map(s => s.trim()).filter(Boolean);
}

// ── Search ───────────────────────────────────────────────────────────────

/** Search vault with Obsidian's built-in search. */
export async function cliSearch(
  vaultName: string,
  query: string,
  limit = 20,
): Promise<string[]> {
  const { stdout } = await obsidian(vaultName, [
    "search",
    `query=${escapeArg(query)}`,
    `limit=${limit}`,
    "format=text",
  ]);
  return stdout.split("\n").filter(Boolean);
}

// ── Links ────────────────────────────────────────────────────────────────

/** Get backlinks for a note. */
export async function cliGetBacklinks(
  vaultName: string,
  notePath: string,
): Promise<string[]> {
  const { stdout } = await obsidian(vaultName, [
    "backlinks",
    `path=${notePath}`,
  ]);
  return stdout.split("\n").map(s => s.trim()).filter(Boolean);
}

/** Get outgoing links from a note. */
export async function cliGetLinks(
  vaultName: string,
  notePath: string,
): Promise<string[]> {
  const { stdout } = await obsidian(vaultName, [
    "links",
    `path=${notePath}`,
  ]);
  return stdout.split("\n").map(s => s.trim()).filter(Boolean);
}

// ── Tags ─────────────────────────────────────────────────────────────────

/** Get all tags with counts for a vault. */
export async function cliGetTags(
  vaultName: string,
): Promise<Map<string, number>> {
  const { stdout } = await obsidian(vaultName, ["tags", "counts"]);
  const counts = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // obsidian tags counts: "#tagname\tcount" (tab-separated)
    const parts = trimmed.split("\t");
    if (parts.length >= 2) {
      const tag = parts[0].replace(/^#/, "").trim();
      const count = parseInt(parts[1]) || 0;
      if (tag) counts.set(tag, count);
    }
  }
  return counts;
}

// ── Note creation ────────────────────────────────────────────────────────

/** Create a new note or overwrite an existing one. */
export async function cliCreateNote(
  vaultName: string,
  notePath: string,
  content: string,
  open = false,
): Promise<void> {
  const args = ["create", `path=${notePath}`, `content=${escapeArg(content)}`];
  if (open) args.push("open");
  await obsidian(vaultName, args);
}

/** Append content to a note. */
export async function cliAppendNote(
  vaultName: string,
  notePath: string,
  content: string,
): Promise<void> {
  await obsidian(vaultName, [
    "append",
    `path=${notePath}`,
    `content=${escapeArg(content)}`,
  ]);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseVaultsOutput(stdout: string): VaultInfo[] {
  const vaults: VaultInfo[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // obsidian vaults verbose: tab-separated (name\tpath)
    const parts = trimmed.split("\t");
    if (parts.length >= 2) {
      vaults.push({ name: parts[0].trim(), path: parts[1].trim() });
    }
  }
  return vaults;
}

/** Escape a value for use in a key=value CLI argument. */
function escapeArg(value: string): string {
  // Newlines would break the CLI arg — replace with space
  return value.replace(/\n/g, " ").replace(/\r/g, "");
}
