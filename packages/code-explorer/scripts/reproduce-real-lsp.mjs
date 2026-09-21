import { rmSync } from "node:fs";
import {
  loadAdapterSelectionRecord,
} from "../dist/semantic/adapter-selection/adapter-selection.js";
import { collectObservations } from "./reproduce-real-lsp-observe.mjs";
import {
  fixture,
  language,
  temporaryRoot,
} from "./reproduce-real-lsp-fixture.mjs";
import { createRuntime } from "./reproduce-real-lsp-runtime.mjs";

async function shutdownBackend(backend, spawnedProcesses) {
  const shutdown = backend.shutdown?.();
  if (!shutdown) return;
  const completed = await Promise.race([
    shutdown.then(() => true),
    new Promise((resolve_) => setTimeout(() => resolve_(false), 4_000)),
  ]);
  if (completed) return;
  for (const child of spawnedProcesses) child.kill();
  await shutdown;
}

function cleanupFixture() {
  try {
    rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        cleanup:
          error instanceof Error
            ? error.message.replaceAll(temporaryRoot, "<fixture>")
            : String(error),
      }),
    );
  }
}

const record = loadAdapterSelectionRecord();
const { backend, spawnedProcesses, sources } = createRuntime({
  record,
  language,
  temporaryRoot,
  fixture,
});

try {
  await backend.start();
  const observations = await collectObservations(backend, language, sources);
  console.error(
    JSON.stringify({
      language,
      readiness: backend.readiness(),
      capabilities: backend.capabilities?.(),
      observations,
      public_mcp_boundary:
        "internal_adapter_practice_only_navigation_tools_land_in_tasks_3_and_4",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      caught: error instanceof Error ? error.message : String(error),
      readiness: backend.readiness(),
    }),
  );
  process.exitCode = 1;
} finally {
  await shutdownBackend(backend, spawnedProcesses);
  await new Promise((resolve_) => setTimeout(resolve_, 500));
  cleanupFixture();
}
