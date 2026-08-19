import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function buildUnbundledBundle(root) {
  const packageDir = join(root, "fixture-unbundled");
  const bundle = join(packageDir, "dist", "bundle.js");
  const manifest = join(packageDir, "package.json");
  mkdirSync(join(packageDir, "dist"), { recursive: true });
  writeFileSync(
    bundle,
    'import "fixture-dependency-that-is-not-bundled";\n' +
      'process.stdin.setEncoding("utf8");\n' +
      "process.stdin.resume();\n",
  );
  writeFileSync(manifest, JSON.stringify({ name: "fixture-unbundled", version: "1.0.0", type: "module" }));
  return {
    name: "fixture-unbundled",
    version: "1.0.0",
    path: bundle,
    manifest,
  };
}
