import assert from "node:assert/strict";
import { it } from "node:test";
import { createProjectRoot } from "../semantic/project-root/project-root.js";
import * as rootSupport from "../testing/project-root/project-root-test-support.js";

const root = "C:/repo";

it("fails a protected read when opened-file identity changes", () => {
  const fs = rootSupport.windowsProjectFilesystem(root);
  const guard = createProjectRoot({
    cwd: root,
    filesystem: fs,
    platform: "win32",
  });
  fs.fstat = () => ({ dev: 1, ino: 3 });
  assert.throws(() => guard.openProtected("src/lib.rs"), /path_identity_changed/);
});

it("accepts an opened Windows file when stat has no device identity", () => {
  const fs = rootSupport.windowsProjectFilesystem(root, 0);
  fs.fstat = () => ({ dev: 12345, ino: 2 });
  const guard = createProjectRoot({
    cwd: root,
    filesystem: fs,
    platform: "win32",
  });
  assert.deepEqual(guard.protectedRead("src/lib.rs"), {
    path: "C:/repo/src/lib.rs",
    bytes: "fixture",
  });
});

it("closes the protected handle and returns no bytes when a path changes", () => {
  const fs = rootSupport.windowsProjectFilesystem(root);
  let closed = false;
  fs.read = () => {
    fs.fstat = () => ({ dev: 1, ino: 3 });
    return "secret bytes";
  };
  fs.close = () => {
    closed = true;
  };
  const guard = createProjectRoot({
    cwd: root,
    filesystem: fs,
    platform: "win32",
  });
  assert.throws(() => guard.protectedRead("src/lib.rs"), /path_identity_changed/);
  assert.equal(closed, true);
});
