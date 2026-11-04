// Decides whether a recorded PID still belongs to the beep reminder. A record
// inside the freshness window can outlive its process (a crash or a reboot
// leaves the file behind), and the OS may hand that PID to an unrelated program.
import { spawnSync } from "node:child_process";
import process from "node:process";

export const BEEP_SCRIPT = "goal-stop-beep.mjs";

export function commandLineQuery(pid, platform = process.platform) {
  if (platform === "win32") {
    const query = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
    return ["powershell", ["-NoProfile", "-Command", query]];
  }
  return ["ps", ["-p", String(pid), "-o", "command="]];
}

// Returns the process command line, or null when no such process answers.
export function readCommandLine(pid, platform = process.platform, spawn = spawnSync) {
  const [command, args] = commandLineQuery(pid, platform);
  const result = spawn(command, args, { encoding: "utf8" });
  const text = result.status === 0 ? String(result.stdout ?? "").trim() : "";
  return text === "" ? null : text;
}

export function isBeepProcess(commandLine) {
  return typeof commandLine === "string" && commandLine.includes(BEEP_SCRIPT);
}
