// biome-ignore lint/correctness/noNodejsModules: This shipped command resolves its direct entrypoint.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command exposes a direct CLI.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command resolves its direct entrypoint.
import { fileURLToPath } from "node:url";
import { runTransport } from "../../../lib/transport-policy.mjs";
import { PROJECT_ITEM_READ_ATTEMPTS, PROJECT_ITEM_RETRY_DELAY_MS } from "./lib/project-item-single-read.mjs";
import { runCli } from "./lib/project-status-cli.mjs";
import { buildProjectItemEditCommand, buildProjectItemReadCommand } from "./lib/project-status-commands.mjs";
import { listStatusOptions } from "./lib/project-status-options.mjs";
import { writeProjectStatuses } from "./lib/project-status-write.mjs";

async function writeProjectStatusesWithFallback({ primaryMutation, evidence = [], ...options }) {
  const request = {
    owner: options.owner,
    projectNumber: options.projectNumber,
    statusFieldId: options.statusFieldId,
    statusOptionId: options.statusOptionId,
    expectedStatus: options.expectedStatus,
    itemIds: options.itemIds,
  };
  return runTransport({
    operation: "projectStatusWrite",
    request,
    primary: primaryMutation,
    rest: () => writeProjectStatuses(options),
    restEndpoint: `PATCH /users/${options.owner}/projectsV2/${options.projectNumber}/items/{itemId}`,
    mutation: true,
    readback: options.readback,
    evidence,
  });
}

let entrypoint = "";
if (process.argv[1]) {
  entrypoint = resolve(process.argv[1]);
}
const modulePath = resolve(fileURLToPath(import.meta.url));
if (entrypoint === modulePath) {
  runCli(process.argv.slice(2), { listStatusOptions, writeProjectStatuses });
}

export {
  buildProjectItemEditCommand,
  buildProjectItemReadCommand,
  listStatusOptions,
  PROJECT_ITEM_READ_ATTEMPTS,
  PROJECT_ITEM_RETRY_DELAY_MS,
  writeProjectStatuses,
  writeProjectStatusesWithFallback,
};
