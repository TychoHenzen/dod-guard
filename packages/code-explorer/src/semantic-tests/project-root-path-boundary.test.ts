import assert from "node:assert/strict";
import { it } from "node:test";
import { createProjectRoot, ProjectPathError } from "../semantic/project-root/project-root.js";
import { filesystem } from "../testing/project-root/project-root-test-support.js";

const root = "C:/repo";

it("rejects a client parent path before it can reach a backend", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
    }),
    platform: "win32",
  });
  assert.throws(() => guard.resolveClientPath("../outside.rs"), ProjectPathError);
});

it("rejects a sensitive path before a protected read can reach a backend", () => {
  const guard = createProjectRoot({
    cwd: "/project",
    filesystem: filesystem({
      "/project": { realpath: "/project", dev: 1, ino: 1 },
      "/project/.env": {
        realpath: "/project/.env",
        dev: 1,
        ino: 2,
      },
    }),
    platform: "posix",
  });
  assert.throws(() => guard.protectedRead(".env"), {
    code: "path_outside_project",
  });
});

it("rejects an apparent project path when its canonical target escapes the root", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
      "C:\\repo\\linked.rs": {
        realpath: "C:/outside/secret.rs",
        dev: 2,
        ino: 2,
      },
    }),
    platform: "win32",
  });
  assert.throws(() => guard.resolveClientPath("linked.rs"), /path_outside_project/);
});

it("reports an invalid startup root without exposing the rejected absolute path", () => {
  assert.throws(
    () =>
      createProjectRoot({
        cwd: "C:/missing",
        filesystem: filesystem({}),
        platform: "win32",
      }),
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
