import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";

const NATIVE_TARGETS = {
  arm64: { packageName: "@openai/codex-win32-arm64", triple: "aarch64-pc-windows-msvc" },
  x64: { packageName: "@openai/codex-win32-x64", triple: "x86_64-pc-windows-msvc" },
};

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

function nativeCandidates(packageRoot, target) {
  const packagePath = nativePackagePath(packageRoot, target.packageName);
  const nativeRoot = packagePath ?? join(packageRoot, "node_modules", target.packageName);
  const binary = join("vendor", target.triple, "bin", "codex.exe");
  return [join(nativeRoot, binary), join(packageRoot, binary)];
}

export function resolveWindowsNativeExecutable(shimPath, architecture) {
  const packageRoot = shimPackageRoot(shimPath);
  if (!packageRoot) return undefined;
  const target = architecture === "arm64" ? NATIVE_TARGETS.arm64 : NATIVE_TARGETS.x64;
  return nativeCandidates(packageRoot, target).find((candidate) => existsSync(candidate));
}
