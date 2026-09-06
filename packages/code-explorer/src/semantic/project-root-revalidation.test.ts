import assert from "node:assert/strict";
import { it } from "node:test";
import {
  filesystem,
  windowsProjectFilesystem,
} from "../testing/project-root-test-support.js";
import { createProjectRoot } from "./project-root.js";

const root = "C:/repo";

it("reports unavailable identity when fstat cannot prove the opened", () => {
  const fs = windowsProjectFilesystem(root);
  fs.fstat = () => ({ dev: 1, ino: Number.NaN });
  const guard = createProjectRoot({
    cwd: root,
    filesystem: fs,
    platform: "win32",
  });
  assert.throws(
    () => guard.openProtected("src/lib.rs"),
    /path_identity_unavailable/,
  );
});

it("distinguishes transient root access failures from a changed root", () => {
  const fs = filesystem({
    [root]: { realpath: root, dev: 1, ino: 1 },
  });
  const guard = createProjectRoot({
    cwd: root,
    filesystem: fs,
    platform: "win32",
  });
  fs.realpath = () => {
    const error = new Error("denied") as Error & {
      code: string;
    };
    error.code = "EACCES";
    throw error;
  };
  assert.equal(guard.revalidate(), "inaccessible");
});
