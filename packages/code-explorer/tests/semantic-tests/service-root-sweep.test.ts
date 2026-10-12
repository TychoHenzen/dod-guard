import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { createNativePythonMirror } from "../../src/semantic/python-mirror/python-mirror-runtime.js";
import { makeTreeReadOnly } from "../../src/semantic/python-mirror/python-mirror-permissions.js";
import { createFilteredWorkspace } from "../../src/semantic/workspace/filtered-workspace.js";
import { removeServiceTree } from "../../src/semantic/workspace/owned-resources.js";
import { OWNER_MARKER_FILE } from "../../src/semantic/workspace/service-root.js";
import {
  isOwnerAlive,
  type SweepDeps,
  sweepStaleServiceRoots,
} from "../../src/semantic/workspace/service-root-sweep.js";
import { project } from "../testing/runtime/python-mirror-runtime-test-support.js";

const symlinkSkip =
  process.platform === "win32"
    ? "creating a symlink needs elevation on Windows"
    : false;
const dayAgo = () => new Date(Date.now() - 25 * 60 * 60 * 1000);

it("removes dead-owner and old unmarked roots, logs each, keeps live, own, young and foreign roots", () => {
  const directory = mkdtempSync(join(tmpdir(), "code-explorer-sweep-fixture-"));
  try {
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const dead = makeRoot(directory, "code-explorer-native-dead", {
      pid: deadPid,
    });
    const tree = join(dead, "tree");
    mkdirSync(tree);
    writeFileSync(join(tree, "main.rs"), "fn main() {}\n");
    makeTreeReadOnly(tree);
    const live = makeRoot(directory, "code-explorer-pyright-live", {
      pid: process.ppid,
    });
    const own = makeRoot(directory, "code-explorer-native-own", {
      pid: process.pid,
    });
    const old = makeRoot(directory, "code-explorer-native-old");
    utimesSync(old, dayAgo(), dayAgo());
    const young = makeRoot(directory, "code-explorer-native-young");
    const foreign = makeRoot(directory, "code-explorer-sensitive-native-x", {
      pid: deadPid,
    });
    const lines: string[] = [];
    const removed = sweepStaleServiceRoots(sweepDeps(directory, lines));
    assert.deepEqual([...removed].sort(), [
      "code-explorer-native-dead",
      "code-explorer-native-old",
    ]);
    assert.deepEqual([...lines].sort(), [
      "code-explorer: removed stale temp root code-explorer-native-dead (dead_owner)",
      "code-explorer: removed stale temp root code-explorer-native-old (stale_unmarked)",
    ]);
    assert.equal(existsSync(dead), false);
    assert.equal(existsSync(old), false);
    for (const kept of [live, own, young, foreign])
      assert.equal(existsSync(kept), true);
  } finally {
    removeServiceTree(directory);
  }
});

it("keeps dead-owner and old unmarked roots that another user owns", () => {
  const directory = mkdtempSync(join(tmpdir(), "code-explorer-sweep-fixture-"));
  try {
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
    const dead = makeRoot(directory, "code-explorer-native-dead", {
      pid: deadPid,
    });
    const old = makeRoot(directory, "code-explorer-pyright-old");
    utimesSync(old, dayAgo(), dayAgo());
    const otherUid = lstatSync(dead).uid + 1;
    const removed = sweepStaleServiceRoots({
      ...sweepDeps(directory),
      ownUid: otherUid,
    });
    assert.deepEqual(removed, []);
    assert.equal(existsSync(dead), true);
    assert.equal(existsSync(old), true);
  } finally {
    removeServiceTree(directory);
  }
});

it(
  "removes a dead-owner root holding a link without touching its target",
  { skip: symlinkSkip },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "code-explorer-sweep-fixture-"));
    const outside = mkdtempSync(join(tmpdir(), "code-explorer-sweep-victim-"));
    try {
      const victim = join(outside, "secret.txt");
      writeFileSync(victim, "secret\n");
      chmodSync(victim, 0o600);
      const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
      const dead = makeRoot(directory, "code-explorer-native-dead", {
        pid: deadPid,
      });
      symlinkSync(victim, join(dead, "link"));
      const removed = sweepStaleServiceRoots(sweepDeps(directory));
      assert.deepEqual(removed, ["code-explorer-native-dead"]);
      assert.equal(existsSync(dead), false);
      assert.equal(readFileSync(victim, "utf8"), "secret\n");
      assert.equal(statSync(victim).mode & 0o777, 0o600);
    } finally {
      removeServiceTree(directory);
      removeServiceTree(outside);
    }
  },
);

it(
  "never follows a link named like a service root",
  { skip: symlinkSkip },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "code-explorer-sweep-fixture-"));
    const outside = mkdtempSync(join(tmpdir(), "code-explorer-sweep-victim-"));
    try {
      const target = join(outside, "code-explorer-native-target");
      mkdirSync(target);
      utimesSync(target, dayAgo(), dayAgo());
      symlinkSync(target, join(directory, "code-explorer-native-link"), "dir");
      const removed = sweepStaleServiceRoots(sweepDeps(directory));
      assert.deepEqual(removed, []);
      assert.equal(existsSync(target), true);
    } finally {
      removeServiceTree(directory);
      removeServiceTree(outside);
    }
  },
);

it("isOwnerAlive treats ESRCH as dead and EPERM as alive", () => {
  const gone = Object.assign(new Error("no such process"), { code: "ESRCH" });
  const denied = Object.assign(new Error("operation not permitted"), {
    code: "EPERM",
  });
  assert.equal(
    isOwnerAlive(4242, () => {
      throw gone;
    }),
    false,
  );
  assert.equal(
    isOwnerAlive(4242, () => {
      throw denied;
    }),
    true,
  );
});

it("native and python service roots carry owner.json outside the backend tree", () => {
  const fixture = project({
    "src/main.rs": "fn main() {}\n",
    "src/a.py": "def target() -> str:\n    return 'safe'\n",
  });
  try {
    const filtered = createFilteredWorkspace(fixture.project);
    const native = dirname(filtered.root.canonicalPath);
    assert.deepEqual(readOwner(native), { pid: process.pid });
    assert.equal(
      existsSync(join(filtered.root.canonicalPath, OWNER_MARKER_FILE)),
      false,
    );
    const mirror = createNativePythonMirror(fixture.project);
    const python = dirname(mirror.root);
    assert.deepEqual(readOwner(python), { pid: process.pid });
    assert.equal(existsSync(join(mirror.root, OWNER_MARKER_FILE)), false);
    filtered.dispose();
    mirror.dispose();
    assert.equal(existsSync(native), false);
    assert.equal(existsSync(python), false);
  } finally {
    fixture.dispose();
  }
});

function makeRoot(
  directory: string,
  name: string,
  marker?: { pid: number },
): string {
  const path = join(directory, name);
  mkdirSync(path);
  if (marker)
    writeFileSync(
      join(path, OWNER_MARKER_FILE),
      `${JSON.stringify(marker)}\n`,
    );
  return path;
}

function sweepDeps(directory: string, lines: string[] = []): SweepDeps {
  return {
    directory,
    now: Date.now(),
    ownPid: process.pid,
    ownUid: process.getuid?.(),
    isAlive: (pid) => isOwnerAlive(pid),
    remove: removeServiceTree,
    writeError: (line) => lines.push(line),
  };
}

function readOwner(root: string): unknown {
  return JSON.parse(readFileSync(join(root, OWNER_MARKER_FILE), "utf8"));
}
