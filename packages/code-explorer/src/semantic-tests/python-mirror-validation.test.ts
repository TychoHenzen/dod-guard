import { readFileSync } from "node:fs";
import { it } from "node:test";
import { unsafe, unsafePythonConfigurationKeys } from "../testing/python-mirror-runtime-test-support.js";

it("rejects execution hooks before mirroring", () => {
  for (const key of unsafePythonConfigurationKeys) {
    unsafe({
      "pyrightconfig.json": JSON.stringify({
        [key]: key === "executionEnvironments" ? [] : "../outside",
      }),
    });
    unsafe({
      "pyproject.toml": `[tool.pyright]\n${key} = "../outside"\n`,
    });
  }
  unsafe({ "pyrightconfig.json": "not-json" });
  unsafe({
    "pyproject.toml": "[tool.pyright]\nnot valid toml\n",
  });
});

it("rejects every checked-in unsafe selector fixture before Pyright", () => {
  for (const selector of [
    "project-interpreter.pyrightconfig.json",
    "virtual-environment.pyrightconfig.json",
    "external-import-path.pyrightconfig.json",
    "configuration-replacement.pyrightconfig.json",
  ]) {
    const source = readFileSync(
      new URL(`../../fixtures/safe-mode-sentinels/python/selectors/${selector}`, import.meta.url),
      "utf8",
    );
    unsafe({ "pyrightconfig.json": source });
  }
});
