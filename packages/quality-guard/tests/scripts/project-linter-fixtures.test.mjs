import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempCrate() {
  const root = mkdtempSync(join(tmpdir(), "qg-rust-"));
  writeFileSync(
    join(root, "Cargo.toml"),
    '[package]\nname = "fixture"\nversion = "0.1.0"\n',
  );
  return root;
}

export function clippyLine(overrides = {}) {
  const message = {
    level: "error",
    message: "unneeded `return` statement",
    code: { code: "clippy::needless_return" },
    spans: [
      {
        file_name: "src/main.rs",
        line_start: 3,
        is_primary: true,
      },
    ],
    ...overrides,
  };
  return JSON.stringify({ reason: "compiler-message", message });
}

export function stubSpawn(stdout) {
  return () => ({ stdout, status: 0 });
}
