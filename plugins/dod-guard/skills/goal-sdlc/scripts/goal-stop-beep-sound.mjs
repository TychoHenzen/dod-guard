import { spawnSync } from "node:child_process";
import process from "node:process";

export function soundCommand(platform = process.platform) {
  if (platform === "win32") return ["powershell", ["-NoProfile", "-Command", "[console]::beep(880,400)"]];
  if (platform === "darwin") return ["afplay", ["/System/Library/Sounds/Ping.aiff"]];
  return ["paplay", ["/usr/share/sounds/freedesktop/stereo/bell.oga"]];
}

export function playSound() {
  const [command, args] = soundCommand();
  spawnSync(command, args, { stdio: "ignore" });
}
