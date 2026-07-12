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
    child.on("error", () => {
      // fire-and-forget jingle: spawn errors are best-effort and non-fatal.
      // Sync errors already caught below; async errors on a detached process
      // (e.g. powershell.exe not found mid-flight) cannot be recovered.
    });
    child.unref();
  } catch (err: unknown) {
    // Audio is best-effort; never block verification on it.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dod-guard] playJingle failed", { err: msg });
  }
}
