import assert from "node:assert/strict";
import type { BackendLaunchPreparation } from "../semantic/backend-launch/backend-launch-preparation.js";

const rustSafeInitializationOptions = {
  cargo: {
    buildScripts: { enable: false },
    procMacro: { enable: false },
    checkOnSave: { enable: false },
  },
  projectConfiguration: { enable: false },
};

function expectedRustPreparation(executable: string, event?: "project_backend_config_ignored") {
  return {
    status: "ready",
    executable,
    version: "1.0.0",
    arguments: ["--stdio"],
    shell: false,
    environment: { RUST_BACKTRACE: "0" },
    endpoint: "http://127.0.0.1:8181",
    safe_initialization_options: rustSafeInitializationOptions,
    ...(event ? { event } : {}),
  };
}

export function assertRustPreparation(
  preparation: BackendLaunchPreparation,
  executable: string,
  event?: "project_backend_config_ignored",
): void {
  assert.deepEqual(preparation, expectedRustPreparation(executable, event));
}
