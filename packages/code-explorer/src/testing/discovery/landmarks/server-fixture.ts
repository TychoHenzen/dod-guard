import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LandmarkDiscovery } from "../../../discovery/landmarks.js";
import { createServer } from "../../../index.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";
import { countingAdapter } from "./counting-adapter-fixture.js";

function fixtureRoot(variant: "response" | "route") {
  const root = mkdtempSync(
    join(tmpdir(), `code-explorer-landmark-${variant}-`),
  );
  mkdirSync(join(root, "src"));
  if (variant === "response") {
    writeFileSync(join(root, "src/main.rs"), "fn arbitrary_fallback() {}\n");
    return root;
  }
  writeFileSync(join(root, "src/Helper.ts"), "export const helper = 1;\n");
  return root;
}

export function landmarkServer(
  variant: "response" | "route",
  landmarks?: LandmarkDiscovery,
) {
  const root = fixtureRoot(variant);
  let searches = 0;
  const adapter = countingAdapter(variant === "response", () => {
    searches += 1;
  });
  const server = createServer({
    projectRoot: createNativeProjectRoot(root),
    adapters: [adapter],
    landmarks,
  });
  return {
    server,
    searches: () => searches,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
