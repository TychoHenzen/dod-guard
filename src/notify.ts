import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

/**
 * Play a short, distinctive multi-tone jingle to draw the user's attention to a
 * pending manual verification. Windows-only; fire-and-forget and never throws.
 *
 * Uses an ascending arpeggio via PowerShell's [console]::beep so it is clearly
 * distinct from the single standard system bell / notification chime.
 */
export function playJingle(): void {
  if (!isWindows) return;
  const tune = [
    "[console]::beep(659,140)", // E5
    "[console]::beep(988,140)", // B5
    "[console]::beep(1319,180)", // E6
    "[console]::beep(988,90)", // B5
    "[console]::beep(1319,260)", // E6 (hold)
  ].join(";");
  try {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", tune], {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Audio is best-effort; never block verification on it.
  }
}

export type MessageBoxResult = "yes" | "no" | "timeout";

// WScript.Shell.Popup return codes.
const POPUP_YES = 6;
const POPUP_TIMEOUT = -1;

/**
 * Show a blocking Windows Yes/No dialog spawned by THIS (server) process and
 * resolve with the human's choice. This is the anti-cheat fallback when the MCP
 * client does not support elicitation.
 *
 * The dialog belongs to the server process — Claude cannot programmatically
 * answer another process's modal dialog through normal tool use. Message and
 * title are passed via environment variables to avoid shell-escaping issues.
 *
 * Resolves "no" on any failure or on a non-Windows host, and "timeout" if the
 * dialog auto-dismisses — callers MUST treat anything other than "yes" as a
 * failed verification so a missing human can never yield a pass.
 */
export function showMessageBox(title: string, body: string, timeoutSec: number): Promise<MessageBoxResult> {
  if (!isWindows) return Promise.resolve("no");

  // 4 = Yes/No buttons, 48 = exclamation icon, 4096 = system-modal (stays on top).
  const script =
    "$w = New-Object -ComObject WScript.Shell; " +
    "$r = $w.Popup($env:DODG_MSG, [int]$env:DODG_TIMEOUT, $env:DODG_TITLE, 4 + 48 + 4096); " +
    "[Console]::Out.Write($r)";

  return new Promise((resolve) => {
    try {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        env: {
          ...process.env,
          DODG_MSG: body,
          DODG_TITLE: title,
          DODG_TIMEOUT: String(Math.max(0, Math.floor(timeoutSec))),
        },
      });

      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });
      child.on("error", () => resolve("no"));
      child.on("close", () => {
        const code = parseInt(out.trim(), 10);
        if (code === POPUP_YES) resolve("yes");
        else if (code === POPUP_TIMEOUT) resolve("timeout");
        else resolve("no");
      });
    } catch {
      resolve("no");
    }
  });
}
