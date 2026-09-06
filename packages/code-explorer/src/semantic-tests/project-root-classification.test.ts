import assert from "node:assert/strict";
import { it } from "node:test";
import { createProjectRoot } from "../semantic/project-root/project-root.js";
import { filesystem } from "../testing/project-root-test-support.js";

const root = "C:/repo";

it("classifies an escaped backend path as external without retaining", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
      "C:/repo/linked.rs": {
        realpath: "C:/outside/secret.rs",
        dev: 2,
        ino: 2,
      },
    }),
    platform: "win32",
  });
  assert.deepEqual(guard.classifyBackendPath("C:/repo/linked.rs"), {
    external: true,
  });
});

it("normalizes a Windows-form backend path to a portable project-rel", () => {
  const guard = createProjectRoot({
    cwd: root,
    filesystem: filesystem({
      [root]: { realpath: root, dev: 1, ino: 1 },
      "C:/repo/src/module/file.rs": {
        realpath: "C:/repo/src/module/file.rs",
        dev: 1,
        ino: 2,
      },
    }),
    platform: "win32",
  });
  assert.deepEqual(guard.classifyBackendPath("src\\module\\file.rs"), {
    relative_path: "src/module/file.rs",
  });
});
