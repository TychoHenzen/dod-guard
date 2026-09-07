import { spawn } from "node:child_process";
import type { BrowserOpener } from "./browser-opener.js";

function commandForPlatform(platform: NodeJS.Platform): string {
  if (platform === "win32") return "cmd.exe";
  if (platform === "darwin") return "/usr/bin/open";
  if (platform === "linux") return "xdg-open";
  throw new Error("unsupported platform");
}

function commandArguments(platform: NodeJS.Platform, href: string): string[] {
  return platform === "win32" ? ["/d", "/s", "/c", "start", "", href] : [href];
}

async function openBrowser(url: URL, signal: AbortSignal): Promise<void> {
  const platform = process.platform;
  const child = spawn(
    commandForPlatform(platform),
    commandArguments(platform, url.href),
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.once("spawn", () => {
      signal.removeEventListener("abort", onAbort);
      child.unref();
      resolve();
    });
  });
}

export const nativeBrowserOpener: BrowserOpener = {
  open: openBrowser,
};
