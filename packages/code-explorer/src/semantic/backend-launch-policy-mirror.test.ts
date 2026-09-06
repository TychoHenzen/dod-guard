import { it } from "node:test";
import {
  assert,
  createPythonMirrorPlan,
  digest,
} from "../testing/backend-launch-policy-test-support.js";

it("invalidates the old Python mirror when project configuration cha", () => {
  const text = "x = 1";
  const mirror = createPythonMirrorPlan(
    {},
    [{ path: "src/a.py", sha256: digest(text), text }],
    {
      generation: 4,
      mirror_uri_root: "file:///service-mirror",
      bundled_typeshed: ["typeshed/stdlib"],
    },
  );
  assert.equal(mirror.status, "ready");
  if (mirror.status !== "ready") throw new Error("expected safe mirror");
  assert.deepEqual(mirror.minimal_pyrightconfig, {});
  assert.deepEqual(mirror.bundled_typeshed, ["typeshed/stdlib"]);
  assert.deepEqual(
    mirror.resolveUri("file:///service-mirror/src/a.py", 4, digest(text)),
    {
      status: "accepted",
      original_path: "src/a.py",
    },
  );
  assert.deepEqual(
    mirror.resolveUri("file:///service-mirror/unknown.py", 4, digest(text)),
    {
      status: "rejected",
      code: "unsafe_backend_mode",
    },
  );
  assert.deepEqual(
    mirror.resolveUri("file:///service-mirror/%E0%A4%A", 4, digest(text)),
    {
      status: "rejected",
      code: "unsafe_backend_mode",
    },
  );
  assert.deepEqual(mirror.onProjectConfigurationChanged(), {
    status: "rebuild_required",
    terminate_old_backend: true,
  });
});

it("materializes only hash-verified mirror sources and locks them re", () => {
  const writes: string[] = [];
  const text = "x = 1";
  const mirror = createPythonMirrorPlan(
    {},
    [{ path: "src/a.py", sha256: digest(text), text }],
    {
      generation: 1,
      mirror_uri_root: "file:///service-mirror",
      bundled_typeshed: ["typeshed/stdlib"],
      filesystem: {
        writeFile: (path) => writes.push(path),
        makeReadOnly: () => writes.push("readonly-root"),
      },
    },
  );
  assert.equal(mirror.status, "ready");
  assert.deepEqual(writes, ["pyrightconfig.json", "src/a.py", "readonly-root"]);
  assert.deepEqual(
    createPythonMirrorPlan({}, [
      { path: "src/a.py", sha256: "a".repeat(64), text },
    ]),
    {
      status: "unavailable",
      code: "unsafe_backend_mode",
    },
  );
});
