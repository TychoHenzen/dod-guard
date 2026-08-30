import assert from "node:assert/strict";
import { it } from "node:test";
import { createProjectRoot, ProjectPathError } from "./project-root.js";

type Entry = { realpath: string; dev: number; ino: number };

function filesystem(entries: Record<string, Entry>) {
  const entryFor = (path: string): Entry | undefined => entries[path] ?? entries[path.replaceAll("\\", "/")];
  return {
    realpath(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
      return entry.realpath;
    },
    stat(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
      return { dev: entry.dev, ino: entry.ino };
    },
    open(path: string) {
      const entry = entryFor(path);
      if (!entry) throw new Error("ENOENT");
      return path;
    },
    fstat(handle: string) {
      return this.stat(handle);
    },
    read() {
      return "fixture";
    },
    close() {},
  };
}

const root = "C:/repo";

// covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Client supplies a parent-directory path
it("rejects a client parent path before it can reach a backend", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({ [root]: { realpath: root, dev: 1, ino: 1 } }),
    platform: "win32",
  });

  assert.throws(() => guard.resolveClientPath("../outside.rs"), ProjectPathError);
});

// covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: In-root symlink targets an external file
it("rejects an apparent project path when its canonical target escapes the root", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
      "C:\\repo\\linked.rs": { realpath: "C:/outside/secret.rs", dev: 2, ino: 2 },
    }),
    platform: "win32",
  });

  assert.throws(() => guard.resolveClientPath("linked.rs"), /path_outside_project/);
});

// covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Startup root is invalid
it("reports an invalid startup root without exposing the rejected absolute path", () => {
  assert.throws(
    () => createProjectRoot({ cwd: "C:/missing", filesystem: filesystem({}), platform: "win32" }),
    (error: unknown) => {
      const pathError = error as ProjectPathError;
      return (
        pathError instanceof ProjectPathError &&
        pathError.code === "invalid_project_root" &&
        !pathError.message.includes("missing")
      );
    },
  );
});

// covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Backend returns a symlinked external file
it("classifies an escaped backend path as external without retaining a local path", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
      "C:/repo/linked.rs": { realpath: "C:/outside/secret.rs", dev: 2, ino: 2 },
    }),
    platform: "win32",
  });

  assert.deepEqual(guard.classifyBackendPath("C:/repo/linked.rs"), { external: true });
});

// covers: code-explorer/language-adapters :: One server process is confined to one canonical project root :: Local path changes during a protected read
it("fails a protected read when opened-file identity changes", () => {
  const fs = filesystem({
    [root]: { realpath: root, dev: 1, ino: 1 },
    "C:/repo/src/lib.rs": { realpath: "C:/repo/src/lib.rs", dev: 1, ino: 2 },
  });
  const guard = createProjectRoot({ cwd: root, filesystem: fs, platform: "win32" });
  fs.fstat = () => ({ dev: 1, ino: 3 });

  assert.throws(() => guard.openProtected("src/lib.rs"), /path_identity_changed/);
});

it("closes the protected handle and returns no bytes when a path changes during the read", () => {
  const fs = filesystem({
    [root]: { realpath: root, dev: 1, ino: 1 },
    "C:/repo/src/lib.rs": { realpath: "C:/repo/src/lib.rs", dev: 1, ino: 2 },
  });
  let closed = false;
  fs.read = () => {
    fs.fstat = () => ({ dev: 1, ino: 3 });
    return "secret bytes";
  };
  fs.close = () => {
    closed = true;
  };
  const guard = createProjectRoot({ cwd: root, filesystem: fs, platform: "win32" });

  assert.throws(() => guard.protectedRead("src/lib.rs"), /path_identity_changed/);
  assert.equal(closed, true);
});

it("reports unavailable identity when fstat cannot prove the opened file", () => {
  const fs = filesystem({
    [root]: { realpath: root, dev: 1, ino: 1 },
    "C:/repo/src/lib.rs": { realpath: "C:/repo/src/lib.rs", dev: 1, ino: 2 },
  });
  fs.fstat = () => ({ dev: 1, ino: Number.NaN });
  const guard = createProjectRoot({ cwd: root, filesystem: fs, platform: "win32" });

  assert.throws(() => guard.openProtected("src/lib.rs"), /path_identity_unavailable/);
});
