import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPythonMirrorPlan } from "./backend-launch-policy.js";
import type { ProjectRoot } from "./project-root.js";

type MirroredFile = { original_sha256: string; mirror_sha256: string };
type PythonMirrorSnapshot = {
  configuration: Record<string, unknown>;
  inputs: readonly { path: string; text: string; sha256: string }[];
  fingerprint: string;
};

export type NativePythonMirror = {
  root: string;
  generation: number;
  uriFor(path: string): string;
  pathForUri(uri: string): string | undefined;
  dispose(): void;
  disposeAfterShutdown(shutdown: () => void | Promise<void>): Promise<void>;
};

export type PythonMirrorManager = {
  current(): NativePythonMirror | undefined;
  refresh(): Promise<
    | { status: "ready"; mirror: NativePythonMirror; changed: boolean }
    | { status: "unavailable"; code: "unsafe_backend_mode" }
  >;
  disposeAfterShutdown(shutdown: () => void | Promise<void>): Promise<void>;
};

const bundledTypeshed = Object.freeze({
  "typeshed/stdlib/builtins.pyi": "class object: ...\nclass str(object): ...\nclass int(object): ...\n",
});

/** Creates the only project material a Pyright process may see. */
export function createNativePythonMirror(root: ProjectRoot, generation = 0): NativePythonMirror {
  return createMirror(root, generation, snapshotPythonProject(root));
}

/**
 * Owns publication of Python mirror generations. A changed project retires its
 * old backend before rebuilding, and never publishes a failed replacement.
 */
export function createPythonMirrorManager(
  root: ProjectRoot,
  terminateOldBackend: () => void | Promise<void> = () => {},
): PythonMirrorManager {
  let active: { mirror: NativePythonMirror; fingerprint: string } | undefined;
  let nextGeneration = 0;
  const retireActive = async () => {
    if (!active) return;
    const old = active.mirror;
    active = undefined;
    try {
      await old.disposeAfterShutdown(terminateOldBackend);
    } catch {
      // A failed shutdown still removes this generation from publication.
    }
  };
  return {
    current: () => active?.mirror,
    async refresh() {
      let snapshot: PythonMirrorSnapshot;
      try {
        snapshot = snapshotPythonProject(root);
      } catch {
        await retireActive();
        return { status: "unavailable", code: "unsafe_backend_mode" };
      }
      if (active?.fingerprint === snapshot.fingerprint)
        return { status: "ready", mirror: active.mirror, changed: false };
      await retireActive();
      try {
        const mirror = createMirror(root, nextGeneration++, snapshot);
        active = { mirror, fingerprint: snapshot.fingerprint };
        return { status: "ready", mirror, changed: true };
      } catch {
        return { status: "unavailable", code: "unsafe_backend_mode" };
      }
    },
    async disposeAfterShutdown(shutdown) {
      await shutdown();
      active?.mirror.dispose();
      active = undefined;
    },
  };
}

function createMirror(root: ProjectRoot, generation: number, snapshot: PythonMirrorSnapshot): NativePythonMirror {
  const plan = createPythonMirrorPlan(snapshot.configuration, snapshot.inputs, {
    generation,
    mirror_uri_root: "file:///pending-python-mirror",
    bundled_typeshed: Object.keys(bundledTypeshed),
  });
  if (plan.status !== "ready") throw new Error("unsafe_backend_mode");

  const serviceRoot = mkdtempSync(join(tmpdir(), "code-explorer-pyright-"));
  const mirrorRoot = join(serviceRoot, `generation-${generation}`);
  const manifest = new Map<string, MirroredFile>();
  try {
    mkdirSync(mirrorRoot, { recursive: true, mode: 0o755 });
    writeMirrorFile(mirrorRoot, "pyrightconfig.json", "{}\n");
    for (const input of snapshot.inputs) {
      writeMirrorFile(mirrorRoot, input.path, input.text);
      manifest.set(input.path, { original_sha256: input.sha256, mirror_sha256: input.sha256 });
    }
    for (const [path, text] of Object.entries(bundledTypeshed)) writeMirrorFile(mirrorRoot, path, text);
    makeTreeReadOnly(mirrorRoot);
  } catch (error) {
    makeTreeWritable(serviceRoot);
    rmSync(serviceRoot, { recursive: true, force: true });
    throw error;
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    process.removeListener("exit", dispose);
    makeTreeWritable(serviceRoot);
    rmSync(serviceRoot, { recursive: true, force: true });
  };
  process.once("exit", dispose);
  const expectedTree = new Map<string, string>([
    ["pyrightconfig.json", sha256("{}\n")],
    ...snapshot.inputs.map((input) => [input.path, input.sha256] as const),
    ...Object.entries(bundledTypeshed).map(([path, text]) => [path, sha256(text)] as const),
  ]);
  const verify = (path: string): boolean => {
    const expected = manifest.get(path);
    if (!expected || disposed) return false;
    try {
      const original = root.protectedRead(path).bytes;
      const mirrorPath = join(mirrorRoot, path);
      if (lstatSync(mirrorPath).isSymbolicLink()) return false;
      return (
        mirrorTreeMatches(mirrorRoot, expectedTree) &&
        sha256(original) === expected.original_sha256 &&
        sha256(readFileSync(mirrorPath, "utf8")) === expected.mirror_sha256
      );
    } catch {
      return false;
    }
  };
  return {
    root: mirrorRoot,
    generation,
    uriFor: (path) => (verify(path) ? pathToFileURL(join(mirrorRoot, path)).href : ""),
    pathForUri: (uri) => {
      const path = relativeMirrorPath(uri, mirrorRoot);
      return path && verify(path) ? path : undefined;
    },
    dispose,
    async disposeAfterShutdown(shutdown) {
      await shutdown();
      dispose();
    },
  };
}

function snapshotPythonProject(root: ProjectRoot): PythonMirrorSnapshot {
  const configuration = readProjectPythonConfiguration(root);
  const inputs = collectPythonFiles(root).map((path) => {
    const text = root.protectedRead(path).bytes;
    return { path, text, sha256: sha256(text) };
  });
  return {
    configuration,
    inputs,
    fingerprint: sha256(
      `${JSON.stringify(configuration)}\n${inputs.map((input) => `${input.path}:${input.sha256}`).join("\n")}`,
    ),
  };
}

function readProjectPythonConfiguration(root: ProjectRoot): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const pyright = protectedOptionalRead(root, "pyrightconfig.json");
  if (pyright !== undefined) {
    try {
      const parsed = JSON.parse(pyright);
      if (!isRecord(parsed)) throw new Error("invalid");
      config.pyrightconfig = parsed;
    } catch {
      throw new Error("unsafe_backend_mode");
    }
  }
  const pyproject = protectedOptionalRead(root, "pyproject.toml");
  if (pyproject !== undefined) {
    const parsed = parseToolPyright(pyproject);
    if (parsed === undefined) throw new Error("unsafe_backend_mode");
    if (Object.keys(parsed).length) config.tool_pyright = parsed;
  }
  return config;
}

function protectedOptionalRead(root: ProjectRoot, path: string): string | undefined {
  const absolute = join(root.canonicalPath, path);
  if (!existsSync(absolute)) return undefined;
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("unsafe_backend_mode");
  return root.protectedRead(path).bytes;
}

/** Parses only the TOML table we must police. Unknown TOML forms fail closed. */
function parseToolPyright(toml: string): Record<string, unknown> | undefined {
  const lines = toml.replace(/^\uFEFF/, "").split(/\r?\n/);
  let active = false;
  const result: Record<string, unknown> = {};
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    if (/^\[.*\]$/.test(line)) {
      active = line === "[tool.pyright]";
      continue;
    }
    if (!active) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) return undefined;
    result[match[1]] = parseTomlValue(match[2]);
  }
  return result;
}

function parseTomlValue(value: string): unknown {
  const trimmed = value.trim();
  if (/^(true|false)$/.test(trimmed)) return trimmed === "true";
  if (/^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^\[.*\]$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(",").map((item) => parseTomlValue(item)) : [];
  }
  return trimmed;
}

function collectPythonFiles(root: ProjectRoot): string[] {
  const visit = (directory: string, relativeDirectory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = join(directory, entry.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (lstatSync(absolute).isSymbolicLink()) throw new Error("unsafe_backend_mode");
      if (entry.isDirectory()) return isSensitivePath(relativePath) ? [] : visit(absolute, relativePath);
      if (
        !(entry.isFile() && (relativePath.endsWith(".py") || relativePath.endsWith(".pyi"))) ||
        isSensitivePath(relativePath)
      )
        return [];
      const resolved = root.resolveClientPath(relativePath);
      if (!samePath(resolved, absolute)) throw new Error("unsafe_backend_mode");
      return [relativePath];
    });
  return visit(root.canonicalPath, "");
}

function isSensitivePath(path: string): boolean {
  return path.split("/").some((part) => /^(\.git|\.venv|venv|node_modules|__pycache__|secrets?)$/i.test(part));
}

function writeMirrorFile(root: string, relativePath: string, text: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
  writeFileSync(target, text, { encoding: "utf8", mode: 0o444 });
}

function makeTreeReadOnly(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) makeTreeReadOnly(target);
    else chmodSync(target, 0o444);
  }
  chmodSync(directory, 0o555);
}

function makeTreeWritable(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) makeTreeWritable(target);
    else chmodSync(target, 0o644);
  }
  chmodSync(directory, 0o755);
}

/** Detects successful writes on platforms where mode bits do not deny the caller. */
function mirrorTreeMatches(root: string, expected: ReadonlyMap<string, string>): boolean {
  try {
    const actual = new Map<string, string>();
    const visit = (directory: string, relativeDirectory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        if (lstatSync(path).isSymbolicLink()) throw new Error("link");
        if (entry.isDirectory()) visit(path, relativePath);
        else if (entry.isFile()) actual.set(relativePath, sha256(readFileSync(path, "utf8")));
        else throw new Error("unsupported");
      }
    };
    visit(root, "");
    return actual.size === expected.size && [...expected].every(([path, digest]) => actual.get(path) === digest);
  } catch {
    return false;
  }
}

function relativeMirrorPath(uri: string, mirrorRoot: string): string | undefined {
  try {
    if (!uri.startsWith("file:")) return undefined;
    const path = fileURLToPath(uri);
    const relativePath = relative(mirrorRoot, path).replaceAll("\\", "/");
    return relativePath && !relativePath.startsWith("../") && relativePath !== ".." ? relativePath : undefined;
  } catch {
    return undefined;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
