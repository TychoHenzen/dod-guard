// Obsidian CLI wrapper — shell out to `obsidian` command
// Falls back to filesystem reads when CLI unavailable.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VaultInfo } from "./types.js";

const execFileP = promisify(execFile);

const OBSIDIAN_CMD = "obsidian";

async function obsidian(args: string[], timeout = 15000): Promise<{ stdout: string; stderr: string }> {
  return execFileP(OBSIDIAN_CMD, args, { timeout, windowsHide: true });
}

export async function listVaults(): Promise<VaultInfo[]> {
  try {
    const { stdout } = await obsidian(["vaults", "--verbose"]);
    return parseVaultsOutput(stdout);
  } catch {
    return []; // CLI not available, return empty
  }
}

export async function getVaultInfo(): Promise<Partial<VaultInfo>> {
  try {
    const { stdout } = await obsidian(["vault"]);
    const m: Partial<VaultInfo> = {};
    for (const line of stdout.split("\n")) {
      const [key, ...rest] = line.split(":").map(s => s.trim());
      const value = rest.join(":").trim();
      if (key === "Name") m.name = value;
      if (key === "Path") m.path = value;
      if (key === "Files") m.noteCount = parseInt(value) || 0;
      if (key === "Folders") m.folderCount = parseInt(value) || 0;
      if (key === "Size") m.size = value;
    }
    return m;
  } catch {
    return {};
  }
}

export async function cliSearch(query: string, vaultPath?: string): Promise<string[]> {
  try {
    const args = ["search", query];
    if (vaultPath) args.push("--vault", vaultPath);
    const { stdout } = await obsidian(args);
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function cliAvailable(): Promise<boolean> {
  try {
    await obsidian(["version"], 5000);
    return true;
  } catch {
    return false;
  }
}

function parseVaultsOutput(stdout: string): VaultInfo[] {
  const vaults: VaultInfo[] = [];
  let current: Partial<VaultInfo> = {};
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.name && current.path) vaults.push(current as VaultInfo);
      current = {};
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      const key = trimmed.slice(0, colon).trim();
      const value = trimmed.slice(colon + 1).trim();
      if (key === "Name") current.name = value;
      if (key === "Path") current.path = value;
      if (key === "Files") current.noteCount = parseInt(value) || 0;
    }
  }
  if (current.name && current.path) vaults.push(current as VaultInfo);
  return vaults;
}
