import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../../index.js";
import * as projectRoot from "../../semantic/project-root/project-root.js";
import { adapterWithSymbols, symbol } from "./index-test-server-support.js";

const { createNativeProjectRoot } = projectRoot;

it("normalizes Windows-form backend paths in discovery responses", async () => {
  const root = mkdtempSync(
    join(tmpdir(), "code-explorer-server-windows-path-"),
  );
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "Helper.rs"), "fn helper() {}\n");
    const server = createServer({
      projectRoot: createNativeProjectRoot(root),
      adapters: [adapterWithSymbols([symbol("function", "src\\Helper.rs")])],
    });
    const result = await server.call("code_search", { query: "helper" });
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected discovery response");
    assert.ok(
      (result.data.candidates as { path: string }[]).every(
        ({ path }) => path === "src/Helper.rs",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it(
  "rejects an out-of-project backend location " + "without exposing its path",
  async () => {
    const root = mkdtempSync(
      join(tmpdir(), "code-explorer-server-external-path-"),
    );
    const outside = mkdtempSync(join(tmpdir(), "code-explorer-external-path-"));
    try {
      writeFileSync(join(outside, "Helper.rs"), "fn helper() {}\n");
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [
          adapterWithSymbols([symbol("function", join(outside, "Helper.rs"))]),
        ],
      });
      const result = await server.call("code_search", { query: "helper" });
      assert.deepEqual(result, {
        schema_version: 1,
        code: "path_outside_project",
        message: "path_outside_project",
        retryable: false,
      });
      assert.equal(JSON.stringify(result).includes(outside), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  },
);

it(
  "removes sensitive adapter symbols before discovery " +
    "classification, filters, limits, and responses",
  async () => {
    const root = mkdtempSync(
      join(tmpdir(), "code-explorer-server-sensitive-symbols-"),
    );
    try {
      const adapter = adapterWithSymbols([
        symbol("function", ".env"),
        symbol("function", ".git/config"),
        symbol("function", "keys\\nested\\key.pem"),
        symbol("function", "src/Helper.rs"),
      ]);
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [adapter],
      });
      const searches = await Promise.all([
        server.call("code_search", { query: "helper", limit: 50 }),
        server.call("code_search", {
          query: "helper",
          path_globs: ["**"],
          limit: 1,
        }),
        server.call("code_search", {
          query: "helper",
          kinds: ["function"],
          limit: 50,
        }),
      ]);
      const status = await server.call("code_status", { action: "status" });
      for (const result of [...searches, status]) {
        assert.equal("code" in result, false);
        if ("code" in result) throw new Error("expected discovery response");
        assert.doesNotMatch(
          JSON.stringify(result),
          /\.env|\.git\/config|key\.pem/iu,
        );
      }
      for (const result of searches) {
        if ("code" in result) throw new Error("expected discovery response");
        assert.deepEqual(
          (result.data.candidates as { path: string }[]).map(
            (candidate) => candidate.path,
          ),
          ["src/Helper.rs"],
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
