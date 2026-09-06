import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createPythonMirrorPlan } from "./python-mirror.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import {
  createDisposer,
  createMirrorTree,
} from "./python-mirror-filesystem.js";
import { relativeMirrorPath } from "./python-mirror-path.js";
import type { PythonMirrorApi } from "./python-mirror-runtime-types.js";
import type { PythonMirrorSnapshot } from "./python-mirror-snapshot.js";
import { BUNDLED_TYPESHED } from "./python-mirror-typeshed.js";
import {
  expectedTreeFor,
  verifyMirrorPath,
} from "./python-mirror-verification.js";

export function createMirror(
  root: ProjectRoot,
  generation: number,
  snapshot: PythonMirrorSnapshot,
): PythonMirrorApi["mirror"] {
  const context = createMirrorContext(root, generation, snapshot);
  return {
    root: context.paths.mirrorRoot,
    generation,
    sourcePaths: () => context.plan.files.map(({ path }) => path),
    uriFor: (path) =>
      context.verify(path)
        ? pathToFileURL(join(context.paths.mirrorRoot, path)).href
        : "",
    pathForUri: (uri) => {
      const path = relativeMirrorPath(uri, context.paths.mirrorRoot);
      return path && context.verify(path) ? path : undefined;
    },
    dispose: context.dispose.dispose,
    disposeAfterShutdown: disposeAfterShutdown,
  };

  async function disposeAfterShutdown(shutdown: () => void | Promise<void>) {
    await shutdown();
    context.dispose.dispose();
  }
}

function createMirrorContext(
  root: ProjectRoot,
  generation: number,
  snapshot: PythonMirrorSnapshot,
) {
  const plan = createPythonMirrorPlan(snapshot.configuration, snapshot.inputs, {
    generation,
    mirror_uri_root: "file:///pending-python-mirror",
    bundled_typeshed: Object.keys(BUNDLED_TYPESHED),
  });
  if (plan.status !== "ready") throw new Error("unsafe_backend_mode");
  const paths = createMirrorTree(plan);
  const dispose = createDisposer(paths.serviceRoot);
  return {
    plan,
    paths,
    dispose,
    verify: createVerifier({
      root,
      mirrorRoot: paths.mirrorRoot,
      plan,
      dispose,
    }),
  };
}

function createVerifier(input: {
  root: ProjectRoot;
  mirrorRoot: string;
  plan: Extract<ReturnType<typeof createPythonMirrorPlan>, { status: "ready" }>;
  dispose: ReturnType<typeof createDisposer>;
}) {
  const expectedTree = expectedTreeFor(input.plan);
  const manifest = new Map(
    input.plan.files.map((file) => [
      file.path,
      {
        original_sha256: file.sha256,
        mirror_sha256: file.sha256,
      },
    ]),
  );
  return (path: string): boolean =>
    verifyMirrorPath({
      path,
      root: input.root,
      mirrorRoot: input.mirrorRoot,
      expectedTree,
      manifest,
      disposed: input.dispose.disposed(),
    });
}
