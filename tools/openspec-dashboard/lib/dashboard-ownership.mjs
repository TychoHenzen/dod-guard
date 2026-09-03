// dashboard-ownership.mjs - private, authenticated dashboard replacement handoff.

import { request as nodeRequest } from "node:http";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

const MAX_RESPONSE_BYTES = 1024;
const SHUTDOWN_TIMEOUT_MS = 1000;
const RELEASE_TIMEOUT_MS = 15_000;

function failed() {
  const error = new Error("dashboard_replacement_failed");
  error.code = "dashboard_replacement_failed";
  return error;
}

function normalizeLoopback(address) {
  return address === "::ffff:127.0.0.1" ? "127.0.0.1" : address;
}

function contained(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (!remainder.startsWith("..") && !remainder.includes("..\\") && !remainder.includes("../"));
}

/** Accept only the control endpoint this dashboard owns. */
export function validateControlTarget(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !/^[1-9][0-9]*$/.test(url.port) ||
    Number(url.port) > 65_535 ||
    url.pathname !== "/api/admin/shutdown" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) return null;
  return url;
}

/** The capability is not sent until the connected peer proved it is loopback. */
export function requestAuthenticatedShutdown(record, { request = nodeRequest, timeoutMs = SHUTDOWN_TIMEOUT_MS } = {}) {
  const url = validateControlTarget(record?.control_url);
  if (!url || typeof record?.replacement_capability !== "string" || !/^[a-f0-9]{64}$/i.test(record.replacement_capability)) {
    return Promise.reject(failed());
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        value ? resolve() : reject(failed());
      }
    };
    let req;
    try {
      req = request(
        { host: "127.0.0.1", port: Number(url.port), path: "/api/admin/shutdown", method: "POST", agent: false },
        (response) => {
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_RESPONSE_BYTES) {
              response.destroy();
              finish(false);
            }
          });
          response.once("error", () => finish(false));
          response.once("end", () => finish(response.statusCode === 200));
          response.resume?.();
        },
      );
      req.once("socket", (socket) => {
        const connected = () => {
          if (normalizeLoopback(socket.remoteAddress) !== "127.0.0.1") {
            req.destroy();
            finish(false);
            return;
          }
          req.setHeader("x-openspec-dashboard-replacement-capability", record.replacement_capability);
          req.end();
        };
        if (socket.connecting) socket.once("connect", connected);
        else connected();
      });
      req.once("error", () => finish(false));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        finish(false);
      });
    } catch {
      finish(false);
    }
  });
}

const systemFs = {
  chmod: chmodSync,
  close: closeSync,
  exists: existsSync,
  lstat: lstatSync,
  mkdir: mkdirSync,
  open: openSync,
  readFile: readFileSync,
  realpath: realpathSync,
  stat: statSync,
  unlink: unlinkSync,
  write: writeFileSync,
};

export function windowsAclEnvironment(path, env = process.env) {
  return Object.fromEntries(
    ["SystemRoot", "WINDIR", "ComSpec"]
      .filter((name) => env[name] !== undefined)
      .map((name) => [name, env[name]])
      .concat([["OPENSPEC_DASHBOARD_ACL_PATH", path]]),
  );
}

function verifyWindowsPrivateAcl(path) {
  // This is a fixed PowerShell host adapter, started without a shell. The path
  // travels in one child-only environment value and is never interpolated.
  const script = "$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$a=([System.IO.FileInfo]$env:OPENSPEC_DASHBOARD_ACL_PATH).GetAccessControl();$x=@($a.Access|%{$sid=$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;@{sid=$sid;type=$_.AccessControlType.ToString()}});@{owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;current=$me;access=$x}|ConvertTo-Json -Compress";
  try {
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = JSON.parse(execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      env: windowsAclEnvironment(path),
      windowsHide: true,
      shell: false,
    }));
    const allowed = new Set([result.current, "S-1-5-18", "S-1-5-32-544"]);
    const access = Array.isArray(result.access) ? result.access : [result.access];
    return result.owner === result.current && access.every((entry) => entry && entry.type === "Allow" && allowed.has(entry.sid));
  } catch {
    return false;
  }
}

function protectWindowsPrivateAcl(path, directory) {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = `$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.${directory ? "DirectorySecurity" : "FileSecurity"};$a.SetOwner($me);$a.SetAccessRuleProtection($true,$false);$inherit=[Security.AccessControl.InheritanceFlags]::${directory ? "ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit" : "None"};@($me.Value,'S-1-5-18','S-1-5-32-544')|%{$sid=New-Object Security.Principal.SecurityIdentifier($_);$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow');$a.AddAccessRule($rule)};([System.IO.${directory ? "DirectoryInfo" : "FileInfo"}]$env:OPENSPEC_DASHBOARD_ACL_PATH).SetAccessControl($a)`;
  execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: windowsAclEnvironment(path),
    stdio: "ignore",
    windowsHide: true,
    shell: false,
  });
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function privatePosix(path, directory, fs, uid) {
  const info = fs.stat(path);
  return info.uid === uid && (info.mode & 0o777) === (directory ? 0o700 : 0o600);
}

function verifyPrivate(directory, file, { fs, platform, uid, verifyWindowsAcl }) {
  const directoryInfo = fs.lstat(directory);
  const fileInfo = fs.lstat(file);
  if (directoryInfo.isSymbolicLink() || fileInfo.isSymbolicLink() || !contained(fs.realpath(directory), fs.realpath(file))) throw failed();
  if (platform === "win32") {
    if (!verifyWindowsAcl || !verifyWindowsAcl(directory, true) || !verifyWindowsAcl(file, false)) throw failed();
  } else if (!privatePosix(directory, true, fs, uid) || !privatePosix(file, false, fs, uid)) throw failed();
}

function parseOwner(text) {
  try {
    const record = JSON.parse(String(text));
    return validateControlTarget(record.control_url) && typeof record.replacement_capability === "string" ? record : null;
  } catch {
    return null;
  }
}

/**
 * Claims the dashboard owner file. All file-system operations are injectable so
 * ACL and reparse-point cases can be tested without weakening the live boundary.
 */
export function createDashboardOwnership({
  home = homedir(),
  fs = systemFs,
  platform = process.platform,
  uid = process.getuid?.(),
  protectWindowsAcl = protectWindowsPrivateAcl,
  verifyWindowsAcl = verifyWindowsPrivateAcl,
  requestShutdown = requestAuthenticatedShutdown,
  isProcessAlive = processIsAlive,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const directory = join(fs.realpath(home), ".openspec-dashboard");
  const file = join(directory, "dashboard-owner.json");

  function prepareDirectory() {
    if (fs.exists(directory) && fs.lstat(directory).isSymbolicLink()) throw failed();
    fs.mkdir(directory, { recursive: true, mode: 0o700 });
    fs.chmod(directory, 0o700);
    if (fs.lstat(directory).isSymbolicLink() || !contained(fs.realpath(home), fs.realpath(directory))) throw failed();
    if (platform === "win32") protectWindowsAcl(directory, true);
  }

  function write(record) {
    let descriptor;
    let closed = false;
    try {
      descriptor = fs.open(file, "wx", 0o600);
      fs.write(descriptor, JSON.stringify(record));
      fs.chmod(file, 0o600);
      if (platform === "win32") protectWindowsAcl(file, false);
      verifyPrivate(directory, file, { fs, platform, uid, verifyWindowsAcl });
    } catch (error) {
      if (descriptor !== undefined) {
        fs.close(descriptor);
        closed = true;
      }
      throw error?.code === "dashboard_replacement_failed" ? error : failed();
    } finally {
      if (descriptor !== undefined && !closed) fs.close(descriptor);
    }
  }

  async function claim(record) {
    prepareDirectory();
    if (fs.exists(file)) {
      try {
        if (fs.lstat(file).isSymbolicLink() || !contained(fs.realpath(directory), fs.realpath(file))) throw failed();
        if (platform === "win32") protectWindowsAcl(file, false);
        verifyPrivate(directory, file, { fs, platform, uid, verifyWindowsAcl });
        const prior = parseOwner(fs.readFile(file, "utf8"));
        if (!prior) throw failed();
        try {
          await requestShutdown(prior);
          const deadline = now() + RELEASE_TIMEOUT_MS;
          while (fs.exists(file) && now() < deadline) await sleep(25);
          if (fs.exists(file)) throw failed();
        } catch (error) {
          if (isProcessAlive(prior.pid)) throw error;
          fs.unlink(file);
        }
      } catch (error) {
        throw error?.code === "dashboard_replacement_failed" ? error : failed();
      }
    }
    write(record);
  }

  function release() {
    try {
      verifyPrivate(directory, file, { fs, platform, uid, verifyWindowsAcl });
      fs.unlink(file);
    } catch {
      // A tampered ownership file is intentionally left for manual recovery.
    }
  }

  return { claim, directory, file, release };
}
