import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function createSentinelSession(serverEntrypoint, fixture) {
  const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
  const { createNativeProjectRoot } = await import(
    pathToFileURL(`${scriptDirectory}../dist/semantic/project-root.js`).href
  );
  const { createNativePythonMirror } = await import(
    pathToFileURL(
      `${scriptDirectory}../dist/semantic/python-mirror-runtime.js`,
    ).href
  );
  const root = createNativeProjectRoot(fixture);
  const mirror = createNativePythonMirror(root);
  const sentinel = `${fixture}/SENTINEL_SIDE_EFFECT`;
  const child = spawn(process.execPath, [serverEntrypoint, "--stdio"], {
    cwd: mirror.root,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      PATH: "",
      PYTHONPATH: "",
      VIRTUAL_ENV: "",
      CONDA_PREFIX: "",
      CODE_EXPLORER_SENTINEL_PATH: sentinel,
    },
  });
  return { child, mirror, root, sentinel };
}
