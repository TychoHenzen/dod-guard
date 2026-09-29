import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { dirname, join, resolve, sep } from "node:path";

const CODEX_WRITE_APPROVAL_FLAG = "--approve-for-me";
const CODEX_OBSOLETE_APPROVAL_FLAG = "--ask-for-approval";

function validatePrefixArgs(prefixArgs, mode) {
  if (!Array.isArray(prefixArgs) || prefixArgs.some((value) => typeof value !== "string")) {
    throw new TypeError("Codex launcher prefix arguments must be strings");
  }
  if (prefixArgs.includes(CODEX_OBSOLETE_APPROVAL_FLAG)) {
    throw new Error(`Codex launcher does not support ${CODEX_OBSOLETE_APPROVAL_FLAG}`);
  }
  if (mode === "read-only" && prefixArgs.includes(CODEX_WRITE_APPROVAL_FLAG)) {
    throw new Error(`Codex launcher read-only mode rejects ${CODEX_WRITE_APPROVAL_FLAG}`);
  }
}

function validateMode(mode) {
  if (mode !== "read-only" && mode !== "write") {
    throw new Error(`Codex launcher mode is unsupported: ${mode}`);
  }
}

function pathValue(environment) {
  if (typeof environment?.PATH === "string") return environment.PATH;
  if (typeof environment?.Path === "string") return environment.Path;
  const key = Object.keys(environment ?? {}).find((name) => name.toLowerCase() === "path");
  return typeof key === "string" ? environment[key] : "";
}

function windowsPathEntries(environment) {
  return pathValue(environment)
    .split(";")
    .filter((entry) => entry.length > 0)
    .map((entry) => resolve(entry));
}

function shimPackageRoot(shimPath) {
  let contents;
  try {
    contents = readFileSync(shimPath, "utf8");
  } catch {
    return undefined;
  }
  const target = contents.match(/%dp0%[\\/]+([^"\r\n]*?codex\.js)/iu)?.[1];
  if (target) {
    const targetPath = resolve(dirname(shimPath), target.split(/[\\/]/u).join(sep));
    const packageRoot = resolve(dirname(targetPath), "..");
    if (existsSync(join(packageRoot, "package.json"))) return packageRoot;
  }
  const packageRoot = resolve(dirname(shimPath), "node_modules", "@openai", "codex");
  return existsSync(join(packageRoot, "bin", "codex.js")) ? packageRoot : undefined;
}

function nativePackagePath(packageRoot, packageName) {
  try {
    const packageJson = createRequire(join(packageRoot, "package.json")).resolve(`${packageName}/package.json`);
    return dirname(packageJson);
  } catch {
    return undefined;
  }
}

function resolveWindowsNativeExecutable(shimPath, architecture) {
  const packageRoot = shimPackageRoot(shimPath);
  if (!packageRoot) return undefined;
  const target = architecture === "arm64"
    ? { packageName: "@openai/codex-win32-arm64", triple: "aarch64-pc-windows-msvc" }
    : { packageName: "@openai/codex-win32-x64", triple: "x86_64-pc-windows-msvc" };
  const packagePath = nativePackagePath(packageRoot, target.packageName);
  const candidate = packagePath
    ? join(packagePath, "vendor", target.triple, "bin", "codex.exe")
    : join(packageRoot, "node_modules", target.packageName, "vendor", target.triple, "bin", "codex.exe");
  if (existsSync(candidate)) return candidate;
  const bundledCandidate = join(packageRoot, "vendor", target.triple, "bin", "codex.exe");
  if (existsSync(bundledCandidate)) return bundledCandidate;
  return candidate;
}

export function resolveCodexExecutable(platform = process.platform, environment = process.env, architecture = process.arch) {
  if (platform !== "win32") return "codex";
  const entries = windowsPathEntries(environment);
  for (const entry of entries) {
    const nativePath = join(entry, "codex.exe");
    if (existsSync(nativePath)) return nativePath;
  }
  for (const entry of entries) {
    const shimPath = join(entry, "codex.cmd");
    if (existsSync(shimPath)) {
      const nativePath = resolveWindowsNativeExecutable(shimPath, architecture);
      if (nativePath) return nativePath;
    }
  }
  return "codex.exe";
}

export function buildCodexPreflightArgs({ mode = "read-only", prefixArgs = [] } = {}) {
  validateMode(mode);
  validatePrefixArgs(prefixArgs, mode);
  return {
    version: [...prefixArgs, "--version"],
    help: [...prefixArgs, "exec", "--help"],
  };
}

export function buildCodexExecArgs({
  mode = "read-only",
  prefixArgs = [],
  model,
  reasoningEffort,
  schemaPath,
  outputPath,
  workdir,
} = {}) {
  validateMode(mode);
  validatePrefixArgs(prefixArgs, mode);
  const args = [...prefixArgs, "exec"];
  if (mode === "write") {
    args.push(CODEX_WRITE_APPROVAL_FLAG);
  }
  if (model !== undefined) {
    args.push("--model", model);
  }
  args.push("-c", `model_reasoning_effort=${reasoningEffort}`);
  if (mode === "read-only") {
    args.push("-s", "read-only", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--ephemeral");
  }
  args.push("-C", workdir, "--output-schema", schemaPath, "--output-last-message", outputPath, "-");
  return args;
}

export { CODEX_OBSOLETE_APPROVAL_FLAG, CODEX_WRITE_APPROVAL_FLAG };
